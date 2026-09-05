import * as THREE from 'three';
import type { AssetFactoryResult } from './assetRegistry';

export interface SwapDiagnostic { ok: boolean; instanceId: string; assetId: string; scaleCorrection: number; restoredProxy: boolean; message: string; }
export interface AssetInstance { instanceId: string; assetId: string; anchor: THREE.Group; active: AssetFactoryResult; proxy: AssetFactoryResult; timelineTarget: THREE.Group; }

function height(bounds: THREE.Box3): number { return Math.max(1e-6, bounds.max.y - bounds.min.y); }

export class AssetSwapSystem {
  private instances = new Map<string, AssetInstance>();
  register(instanceId: string, assetId: string, proxy: AssetFactoryResult, parent: THREE.Object3D): AssetInstance {
    if (this.instances.has(instanceId)) throw new Error(`Duplicate instanceId: ${instanceId}`);
    const anchor = new THREE.Group(); anchor.name = instanceId; anchor.userData.instanceId = instanceId; anchor.userData.assetId = assetId;
    parent.add(anchor); anchor.add(proxy.root);
    const instance = { instanceId, assetId, anchor, active: proxy, proxy, timelineTarget: anchor }; this.instances.set(instanceId, instance); return instance;
  }
  getTimelineTarget(instanceId: string): THREE.Group { const value = this.instances.get(instanceId); if (!value) throw new Error(`Unknown instanceId: ${instanceId}`); return value.timelineTarget; }
  swap(instanceId: string, finalAsset: AssetFactoryResult): SwapDiagnostic {
    const value = this.instances.get(instanceId); if (!value) return { ok:false, instanceId, assetId:'unknown', scaleCorrection:1, restoredProxy:false, message:'Unknown instance.' };
    if (!(finalAsset.root instanceof THREE.Group) || finalAsset.bounds.isEmpty()) return { ok:false, instanceId, assetId:value.assetId, scaleCorrection:1, restoredProxy:true, message:'Final asset has no valid root or non-empty bounds; proxy retained.' };
    const previous = value.active; const expectedHeight = height(value.proxy.bounds); const finalHeight = height(finalAsset.bounds); const correction = expectedHeight / finalHeight;
    try {
      finalAsset.root.scale.multiplyScalar(correction); finalAsset.root.position.y -= finalAsset.bounds.min.y * correction;
      value.anchor.remove(previous.root); value.anchor.add(finalAsset.root); value.active = finalAsset;
      return { ok:true, instanceId, assetId:value.assetId, scaleCorrection:correction, restoredProxy:false, message:'Final asset installed; anchor transform and timeline target preserved.' };
    } catch (error) {
      value.anchor.remove(finalAsset.root); if (!value.anchor.children.includes(previous.root)) value.anchor.add(previous.root); value.active = previous;
      return { ok:false, instanceId, assetId:value.assetId, scaleCorrection:correction, restoredProxy:true, message:error instanceof Error ? error.message : String(error) };
    }
  }
}
