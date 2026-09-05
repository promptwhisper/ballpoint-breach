import * as THREE from 'three';
import type { EnemyView } from '../enemies';
import type { ArenaBuildResult, ArenaCollider, ArenaWaypoint } from '../level';

const WAYPOINT_REACHED_DISTANCE = 0.78;
const SAME_LEVEL_TOLERANCE = 1.1;

interface NavigationState {
  goalId: string;
  revision: number;
  path: readonly string[];
  cursor: number;
  detour?: THREE.Vector3;
  detourCursor?: number;
  clearCursor?: number;
  visitedDetours?: THREE.Vector3[];
}

function circleOverlaps(collider: ArenaCollider, x: number, z: number, radius: number): boolean {
  const nearestX = THREE.MathUtils.clamp(x, collider.min.x, collider.max.x);
  const nearestZ = THREE.MathUtils.clamp(z, collider.min.z, collider.max.z);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

/** Shared deterministic collision, line-of-sight and waypoint queries for AI and combat. */
export class ArenaQueries {
  private readonly raycaster = new THREE.Raycaster();
  private readonly navigationStates = new WeakMap<THREE.Object3D, NavigationState>();

  constructor(readonly arena: ArenaBuildResult) {}

  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.001) return true;
    this.raycaster.set(from, direction.normalize());
    this.raycaster.far = distance - 0.08;
    return !this.firstWorldHit(this.raycaster, this.raycaster.far);
  }

  segmentBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.001) return false;
    this.raycaster.set(from, direction.normalize());
    this.raycaster.far = distance;
    return this.firstWorldHit(this.raycaster, distance) !== null;
  }

  firstWorldHit(raycaster: THREE.Raycaster, maxDistance: number): THREE.Intersection | null {
    const previousFar = raycaster.far;
    raycaster.far = Math.min(previousFar, maxDistance);
    const hits = raycaster.intersectObjects(this.arena.raycastMeshes, false);
    raycaster.far = previousFar;
    return hits.find((hit) => hit.object.userData.raycastDisabled !== true) ?? null;
  }

  resolveEnemyMovement(enemy: EnemyView, proposed: THREE.Vector3): THREE.Vector3 {
    const current = enemy.position;
    const requestedDelta = proposed.clone().sub(current).setY(0);
    const radius = enemy.collisionRadius;
    const stepHeight = enemy.kind === 'boss' ? 0.66 : 0.48;
    const blocked = (point: THREE.Vector3): boolean => this.isEnemyBlocked(enemy, point, stepHeight);

    const settleStep = (point: THREE.Vector3): THREE.Vector3 => {
      const result = point.clone();
      const step = this.groundHeight(result, enemy);
      if (step !== null && step > current.y && step <= current.y + stepHeight) result.y = step;
      return result;
    };

    // A spawn, knockback, or moving breakable can leave a capsule already
    // overlapping an AABB. Axis sliding cannot recover from that state, so move
    // the capsule to the nearest expanded face before applying its requested step.
    let movementOrigin = current.clone();
    if (blocked(movementOrigin)) {
      movementOrigin = this.depenetrateEnemy(movementOrigin, radius, this.enemyHeight(enemy), stepHeight, blocked);
    }

    const candidate = movementOrigin.clone().add(requestedDelta);
    candidate.y = movementOrigin.y;

    if (!blocked(candidate)) {
      return settleStep(candidate);
    }
    const alternatives: THREE.Vector3[] = [];
    const xOnly = movementOrigin.clone();
    xOnly.x = candidate.x;
    if (Math.abs(requestedDelta.x) > 0.0001 && !blocked(xOnly)) alternatives.push(xOnly);
    const zOnly = movementOrigin.clone();
    zOnly.z = candidate.z;
    if (Math.abs(requestedDelta.z) > 0.0001 && !blocked(zOnly)) alternatives.push(zOnly);

    // A purely head-on request has no useful axis-only candidate. Try a stable
    // tangent in both directions so a lone enemy can walk around cover instead
    // of requiring crowd separation to knock it sideways.
    const stepLength = requestedDelta.length();
    if (stepLength > 0.0001) {
      const sideSign = this.stableSideSign(enemy.id);
      const tangent = new THREE.Vector3(-requestedDelta.z, 0, requestedDelta.x)
        .normalize()
        .multiplyScalar(stepLength * sideSign);
      for (const sign of [1, -1]) {
        const lateral = movementOrigin.clone().addScaledVector(tangent, sign);
        if (!blocked(lateral)) alternatives.push(lateral);
      }
    }

    if (alternatives.length === 0) return movementOrigin;
    const intended = requestedDelta.lengthSq() > 0 ? requestedDelta.clone().normalize() : requestedDelta;
    alternatives.sort((a, b) => {
      const progressA = a.clone().sub(movementOrigin).dot(intended);
      const progressB = b.clone().sub(movementOrigin).dot(intended);
      if (Math.abs(progressA - progressB) > 0.0001) return progressB - progressA;
      return b.distanceToSquared(movementOrigin) - a.distanceToSquared(movementOrigin);
    });
    return settleStep(alternatives[0] ?? movementOrigin);
  }

  groundHeight(position: THREE.Vector3, enemy: EnemyView): number | null {
    let highest: number | null = null;
    const radius = Math.max(0.12, enemy.collisionRadius * 0.58);
    const maxRise = enemy.kind === 'boss' ? 0.68 : 0.5;
    for (const collider of this.arena.colliders) {
      if (!collider.enabled || collider.category === 'wall' || collider.category === 'column') continue;
      if (!circleOverlaps(collider, position.x, position.z, radius)) continue;
      const top = collider.max.y;
      if (top > position.y + maxRise) continue;
      if (highest === null || top > highest) highest = top;
    }
    return highest;
  }

  navigationTarget(enemy: EnemyView, playerPosition: THREE.Vector3): THREE.Vector3 | null {
    const graph = this.arena.waypointGraph;
    const goal = this.nearestOnLevel(playerPosition);
    if (!goal) return playerPosition.clone();
    const revision = Number(enemy.object.userData.navigationRevision ?? 0);

    let state = this.navigationStates.get(enemy.object);
    if (!state || state.goalId !== goal.id || state.revision !== revision || state.path.some((id) => !graph.get(id))) {
      const start = this.nearestOnLevel(enemy.position);
      if (!start) return playerPosition.clone();
      const path = this.findPath(start, goal);
      state = {
        goalId: goal.id,
        revision,
        path: path.length ? path.map((node) => node.id) : [start.id, goal.id],
        cursor: 0,
      };
      this.navigationStates.set(enemy.object, state);
    }

    while (state.cursor < state.path.length) {
      const waypoint = graph.get(state.path[state.cursor] ?? '');
      if (!waypoint) break;
      const navigationPoint = this.projectWaypointToClearance(enemy, waypoint.position);
      const horizontalDistance = Math.hypot(
        enemy.position.x - navigationPoint.x,
        enemy.position.z - navigationPoint.z,
      );
      const verticalDistance = Math.abs(enemy.position.y - waypoint.position.y);
      const reachedDistance = Math.max(WAYPOINT_REACHED_DISTANCE, enemy.collisionRadius * 1.8);
      if (horizontalDistance > reachedDistance || verticalDistance > 1.25) {
        if (state.detour && state.detourCursor === state.cursor) {
          const detourDistance = Math.hypot(
            enemy.position.x - state.detour.x,
            enemy.position.z - state.detour.z,
          );
          if (detourDistance > reachedDistance) return state.detour.clone();
          state.visitedDetours ??= [];
          state.visitedDetours.push(state.detour.clone());
          state.detour = undefined;
          state.detourCursor = undefined;
          state.clearCursor = undefined;
        }
        if (state.clearCursor !== state.cursor) {
          const detour = this.findLocalDetour(enemy, navigationPoint, state.visitedDetours ?? []);
          if (detour) {
            state.detour = detour;
            state.detourCursor = state.cursor;
            return detour.clone();
          }
          state.clearCursor = state.cursor;
        }
        return navigationPoint;
      }
      state.cursor += 1;
      state.detour = undefined;
      state.detourCursor = undefined;
      state.clearCursor = undefined;
      state.visitedDetours = undefined;
    }
    return playerPosition.clone();
  }

  private nearestOnLevel(position: THREE.Vector3): ArenaWaypoint | undefined {
    const graph = this.arena.waypointGraph;
    const sameLevel = graph.nodes.filter((node) => Math.abs(node.position.y - position.y) <= SAME_LEVEL_TOLERANCE);
    const candidates = sameLevel.length ? sameLevel : graph.nodes;
    let nearest: ArenaWaypoint | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const node of candidates) {
      const dx = node.position.x - position.x;
      const dz = node.position.z - position.z;
      const verticalPenalty = Math.abs(node.position.y - position.y) * 0.2;
      const distance = dx * dx + dz * dz + verticalPenalty * verticalPenalty;
      if (distance >= nearestDistance) continue;
      nearest = node;
      nearestDistance = distance;
    }
    return nearest;
  }

  private findPath(start: ArenaWaypoint, goal: ArenaWaypoint): ArenaWaypoint[] {
    const graph = this.arena.waypointGraph;
    const unvisited = new Set(graph.nodes.map((node) => node.id));
    const distances = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
    const previous = new Map<string, string>();
    distances.set(start.id, 0);

    while (unvisited.size > 0) {
      let currentId: string | null = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const id of unvisited) {
        const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
        if (distance >= currentDistance) continue;
        currentId = id;
        currentDistance = distance;
      }
      if (!currentId || !Number.isFinite(currentDistance)) break;
      unvisited.delete(currentId);
      if (currentId === goal.id) break;
      const current = graph.get(currentId);
      if (!current) continue;
      for (const neighbor of graph.neighborsOf(currentId)) {
        if (!unvisited.has(neighbor.id)) continue;
        const distance = currentDistance + current.position.distanceTo(neighbor.position);
        if (distance >= (distances.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) continue;
        distances.set(neighbor.id, distance);
        previous.set(neighbor.id, currentId);
      }
    }

    if (start.id !== goal.id && !previous.has(goal.id)) return [];
    const path: ArenaWaypoint[] = [goal];
    let cursor = goal.id;
    while (cursor !== start.id) {
      const parent = previous.get(cursor);
      if (!parent) return [];
      const node = graph.get(parent);
      if (!node) return [];
      path.push(node);
      cursor = parent;
    }
    return path.reverse();
  }

  private isColliderBlocking(
    enemy: EnemyView,
    collider: ArenaCollider,
    position: THREE.Vector3,
    stepHeight = enemy.kind === 'boss' ? 0.66 : 0.48,
  ): boolean {
    if (!collider.enabled || collider.max.y <= position.y + stepHeight) return false;
    if (position.y + this.enemyHeight(enemy) <= collider.min.y || position.y >= collider.max.y) return false;
    return circleOverlaps(collider, position.x, position.z, enemy.collisionRadius);
  }

  private isEnemyBlocked(enemy: EnemyView, position: THREE.Vector3, stepHeight?: number): boolean {
    return this.arena.colliders.some((collider) => this.isColliderBlocking(enemy, collider, position, stepHeight));
  }

  private projectWaypointToClearance(enemy: EnemyView, waypoint: THREE.Vector3): THREE.Vector3 {
    if (Math.abs(waypoint.y - enemy.position.y) > 1.25) return waypoint.clone();
    const probe = new THREE.Vector3(waypoint.x, enemy.position.y, waypoint.z);
    if (!this.isEnemyBlocked(enemy, probe)) return waypoint.clone();
    const towardEnemy = enemy.position.clone().sub(probe).setY(0);
    if (towardEnemy.lengthSq() > 0.0001) {
      towardEnemy.normalize();
      const limit = enemy.collisionRadius * 3 + 2;
      for (let distance = 0.1; distance <= limit; distance += 0.1) {
        const candidate = probe.clone().addScaledVector(towardEnemy, distance);
        if (this.isEnemyBlocked(enemy, candidate)) continue;
        return new THREE.Vector3(candidate.x, waypoint.y, candidate.z);
      }
    }
    const blocked = (point: THREE.Vector3): boolean => this.isEnemyBlocked(enemy, point);
    const projected = this.depenetrateEnemy(
      probe,
      enemy.collisionRadius,
      this.enemyHeight(enemy),
      enemy.kind === 'boss' ? 0.66 : 0.48,
      blocked,
    );
    return new THREE.Vector3(projected.x, waypoint.y, projected.z);
  }

  private findLocalDetour(
    enemy: EnemyView,
    target: THREE.Vector3,
    visited: readonly THREE.Vector3[],
  ): THREE.Vector3 | null {
    if (Math.abs(target.y - enemy.position.y) > 1.25) return null;
    const blocker = this.firstBlockingColliderAlong(enemy, enemy.position, target);
    if (!blocker) return null;
    const padding = enemy.collisionRadius + 0.22;
    const candidates: THREE.Vector3[] = [
      new THREE.Vector3(blocker.min.x - padding, enemy.position.y, blocker.min.z - padding),
      new THREE.Vector3(blocker.min.x - padding, enemy.position.y, blocker.max.z + padding),
      new THREE.Vector3(blocker.max.x + padding, enemy.position.y, blocker.min.z - padding),
      new THREE.Vector3(blocker.max.x + padding, enemy.position.y, blocker.max.z + padding),
    ].filter((candidate) =>
      candidate.distanceToSquared(enemy.position) > WAYPOINT_REACHED_DISTANCE * WAYPOINT_REACHED_DISTANCE
      && visited.every((point) => point.distanceToSquared(candidate) > WAYPOINT_REACHED_DISTANCE * WAYPOINT_REACHED_DISTANCE)
      && !this.isEnemyBlocked(enemy, candidate)
      && this.firstBlockingColliderAlong(enemy, enemy.position, candidate) === null,
    );
    if (candidates.length === 0) {
      const probeDistance = Math.max(2.4, enemy.collisionRadius * 4);
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        const candidate = enemy.position.clone().add(new THREE.Vector3(
          Math.cos(angle) * probeDistance,
          0,
          Math.sin(angle) * probeDistance,
        ));
        if (visited.some((point) => point.distanceToSquared(candidate) <= WAYPOINT_REACHED_DISTANCE ** 2)) continue;
        if (this.isEnemyBlocked(enemy, candidate)) continue;
        if (this.firstBlockingColliderAlong(enemy, enemy.position, candidate)) continue;
        candidates.push(candidate);
      }
    }
    if (candidates.length === 0) return null;

    const direct = target.clone().sub(enemy.position).setY(0);
    candidates.sort((a, b) => {
      const score = (candidate: THREE.Vector3): number => {
        const offset = candidate.clone().sub(enemy.position).setY(0);
        const cross = direct.x * offset.z - direct.z * offset.x;
        const clockwisePenalty = cross <= 0 ? 0 : 0.35;
        return enemy.position.distanceTo(candidate) + candidate.distanceTo(target) + clockwisePenalty;
      };
      return score(a) - score(b);
    });
    return candidates[0]?.clone() ?? null;
  }

  private firstBlockingColliderAlong(
    enemy: EnemyView,
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): ArenaCollider | null {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    if (distance <= 0.001) return null;
    const samples = Math.max(2, Math.ceil(distance / Math.max(0.12, enemy.collisionRadius * 0.45)));
    for (let index = 1; index <= samples; index += 1) {
      const point = from.clone().lerp(to, index / samples);
      point.y = from.y;
      for (const collider of this.arena.colliders) {
        if (this.isColliderBlocking(enemy, collider, point)) return collider;
      }
    }
    return null;
  }

  private depenetrateEnemy(
    position: THREE.Vector3,
    radius: number,
    collisionHeight: number,
    stepHeight: number,
    blocked: (point: THREE.Vector3) => boolean,
  ): THREE.Vector3 {
    const result = position.clone();
    for (let iteration = 0; iteration < 6 && blocked(result); iteration += 1) {
      let bestOffset: THREE.Vector3 | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const collider of this.arena.colliders) {
        if (!collider.enabled || collider.max.y <= result.y + stepHeight) continue;
        if (result.y + collisionHeight <= collider.min.y || result.y >= collider.max.y) continue;
        if (!circleOverlaps(collider, result.x, result.z, radius)) continue;
        const choices = [
          new THREE.Vector3(collider.min.x - radius - result.x - 0.002, 0, 0),
          new THREE.Vector3(collider.max.x + radius - result.x + 0.002, 0, 0),
          new THREE.Vector3(0, 0, collider.min.z - radius - result.z - 0.002),
          new THREE.Vector3(0, 0, collider.max.z + radius - result.z + 0.002),
        ];
        for (const offset of choices) {
          const distance = offset.lengthSq();
          if (distance >= bestDistance) continue;
          bestOffset = offset;
          bestDistance = distance;
        }
      }
      if (!bestOffset) break;
      result.add(bestOffset);
    }
    return result;
  }

  private stableSideSign(id: string): number {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 2 === 0 ? 1 : -1;
  }

  private enemyHeight(enemy: EnemyView): number {
    if (enemy.kind === 'rusher') return 2.06;
    if (enemy.kind === 'heavy') return 2.27;
    if (enemy.kind === 'boss') return 2.5;
    return 2.16;
  }
}
