import * as THREE from 'three';

export interface WorldCollider {
  id: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  enabled?: boolean;
  tags?: readonly string[];
}

export interface CapsuleBodyState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  grounded: boolean;
}

export interface CapsuleConfig {
  radius: number;
  height: number;
  stepHeight: number;
  gravity: number;
}

const EPSILON = 0.002;

export class PhysicsWorld {
  private colliders: WorldCollider[];

  constructor(colliders: WorldCollider[] = []) {
    this.colliders = colliders;
  }

  setColliders(colliders: WorldCollider[]): void {
    this.colliders = colliders;
  }

  getColliders(): readonly WorldCollider[] {
    return this.colliders;
  }

  moveCapsule(body: CapsuleBodyState, rawDt: number, config: CapsuleConfig): void {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    body.velocity.y -= config.gravity * dt;

    const horizontalDistance = Math.hypot(body.velocity.x * dt, body.velocity.z * dt);
    const substeps = Math.max(1, Math.ceil(horizontalDistance / Math.max(config.radius * 0.35, 0.08)));
    const stepDt = dt / substeps;
    for (let step = 0; step < substeps; step += 1) {
      this.moveHorizontalAxis(body, 'x', body.velocity.x * stepDt, config);
      this.moveHorizontalAxis(body, 'z', body.velocity.z * stepDt, config);
      if (body.grounded) {
        const ground = this.highestGroundAt(body.position.x, body.position.z, body.position.y, config.radius, config.stepHeight);
        if (ground !== null && ground >= body.position.y - 0.08) body.position.y = ground;
      }
    }

    const previousY = body.position.y;
    const nextY = previousY + body.velocity.y * dt;
    if (body.velocity.y > 0) {
      const ceiling = this.lowestCeilingAt(body.position.x, body.position.z, previousY, nextY, config);
      if (ceiling === null) {
        body.position.y = nextY;
      } else {
        body.position.y = ceiling - config.height - EPSILON;
        body.velocity.y = 0;
      }
      body.grounded = false;
      return;
    }

    const ground = this.highestGroundAt(body.position.x, body.position.z, previousY, config.radius, Math.max(config.stepHeight, previousY - nextY + 0.08));
    if (ground !== null && nextY <= ground + EPSILON && previousY >= ground - config.stepHeight - 0.05) {
      body.position.y = ground;
      body.velocity.y = 0;
      body.grounded = true;
    } else {
      body.position.y = nextY;
      body.grounded = false;
    }
  }

  isCapsuleBlocked(position: THREE.Vector3, config: CapsuleConfig, allowStep: boolean): boolean {
    const lower = position.y + 0.04;
    const upper = position.y + config.height - 0.04;
    for (const collider of this.colliders) {
      if (collider.enabled === false) continue;
      if (allowStep && collider.max.y <= position.y + config.stepHeight + EPSILON) continue;
      if (upper <= collider.min.y || lower >= collider.max.y) continue;
      if (this.circleOverlapsAabb(position.x, position.z, config.radius, collider)) return true;
    }
    return false;
  }

  highestGroundAt(x: number, z: number, feetY: number, radius: number, maxRise: number): number | null {
    let highest: number | null = null;
    for (const collider of this.colliders) {
      if (collider.enabled === false) continue;
      if (!this.circleOverlapsAabb(x, z, radius, collider)) continue;
      const top = collider.max.y;
      if (top > feetY + maxRise + EPSILON) continue;
      if (highest === null || top > highest) highest = top;
    }
    return highest;
  }

  private moveHorizontalAxis(body: CapsuleBodyState, axis: 'x' | 'z', amount: number, config: CapsuleConfig): void {
    if (Math.abs(amount) < 1e-8) return;
    const candidate = body.position.clone();
    candidate[axis] += amount;
    if (!this.isCapsuleBlocked(candidate, config, body.grounded)) {
      if (body.grounded) {
        const steppedGround = this.highestGroundAt(candidate.x, candidate.z, candidate.y, config.radius, config.stepHeight);
        if (steppedGround !== null && steppedGround > candidate.y) candidate.y = steppedGround;
      }
      body.position.copy(candidate);
      return;
    }
    body.velocity[axis] = 0;
  }

  private lowestCeilingAt(x: number, z: number, previousFeetY: number, nextFeetY: number, config: CapsuleConfig): number | null {
    const previousTop = previousFeetY + config.height;
    const nextTop = nextFeetY + config.height;
    let lowest: number | null = null;
    for (const collider of this.colliders) {
      if (collider.enabled === false || !this.circleOverlapsAabb(x, z, config.radius, collider)) continue;
      if (collider.min.y < previousTop - EPSILON || collider.min.y > nextTop + EPSILON) continue;
      if (lowest === null || collider.min.y < lowest) lowest = collider.min.y;
    }
    return lowest;
  }

  private circleOverlapsAabb(x: number, z: number, radius: number, collider: WorldCollider): boolean {
    const nearestX = THREE.MathUtils.clamp(x, collider.min.x, collider.max.x);
    const nearestZ = THREE.MathUtils.clamp(z, collider.min.z, collider.max.z);
    const dx = x - nearestX;
    const dz = z - nearestZ;
    return dx * dx + dz * dz < radius * radius;
  }
}
