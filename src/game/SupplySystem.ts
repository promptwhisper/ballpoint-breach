import * as THREE from 'three';
import type { ArenaBuildResult, SupplyPoint } from '../level';

export interface SupplyPickupEvent {
  id: string;
  kind: SupplyPoint['kind'];
  health: number;
  ammo: number;
}

interface SupplyRuntime {
  point: SupplyPoint;
  object: THREE.Object3D | null;
  marker: THREE.Object3D | null;
  markerBaseY: number;
  cooldown: number;
  bobSeed: number;
}

function setRaycastEnabled(object: THREE.Object3D | null, enabled: boolean): void {
  object?.traverse((child) => {
    child.userData.raycastDisabled = !enabled;
  });
}

/** Lightweight proximity pickups backed by the arena's procedural supply markers. */
export class SupplySystem {
  private readonly supplies: SupplyRuntime[];

  constructor(
    arena: ArenaBuildResult,
    private readonly onPickup: (event: SupplyPickupEvent) => void,
  ) {
    this.supplies = arena.supplyPoints.map((point, index) => {
      const marker = arena.root.getObjectByName(`${point.id}-marker`) ?? null;
      return {
        point,
        object: arena.root.getObjectByName(point.id) ?? null,
        marker,
        markerBaseY: marker?.position.y ?? 0,
        cooldown: 0,
        bobSeed: index * 1.37,
      };
    });
  }

  update(dt: number, playerPosition: THREE.Vector3, enabled: boolean): void {
    const elapsed = performance.now() * 0.001;
    for (const supply of this.supplies) {
      if (supply.cooldown > 0) {
        supply.cooldown = Math.max(0, supply.cooldown - dt);
        const available = supply.cooldown <= 0;
        if (supply.object) supply.object.visible = available;
        setRaycastEnabled(supply.object, available);
        continue;
      }

      if (supply.object) {
        supply.object.visible = true;
      }
      setRaycastEnabled(supply.object, true);
      if (supply.marker) {
        supply.marker.rotation.y = elapsed * 0.62 + supply.bobSeed;
        supply.marker.position.y = supply.markerBaseY + Math.sin(elapsed * 1.8 + supply.bobSeed) * 0.07;
      }
      if (!enabled || playerPosition.distanceToSquared(supply.point.position) > 1.15 * 1.15) continue;

      const health = supply.point.kind === 'ammo' ? 0 : supply.point.kind === 'mixed' ? 18 : 30;
      const ammo = supply.point.kind === 'health' ? 0 : supply.point.kind === 'mixed' ? 16 : 28;
      supply.cooldown = supply.point.respawnSeconds;
      if (supply.object) supply.object.visible = false;
      setRaycastEnabled(supply.object, false);
      this.onPickup({ id: supply.point.id, kind: supply.point.kind, health, ammo });
    }
  }

  reset(): void {
    for (const supply of this.supplies) {
      supply.cooldown = 0;
      if (supply.object) supply.object.visible = true;
      setRaycastEnabled(supply.object, true);
      if (supply.marker) supply.marker.position.y = supply.markerBaseY;
    }
  }
}
