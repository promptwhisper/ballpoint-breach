import * as THREE from 'three';

export interface ColliderDescriptor { kind: 'box' | 'sphere' | 'capsule' | 'mesh'; nodeId: string; size?: [number, number, number]; }
export interface RigRuntime { skeleton: THREE.Skeleton; joints: Record<string, THREE.Bone>; }
export interface AssetFactoryResult {
  root: THREE.Group;
  nodes: Record<string, THREE.Object3D>;
  sockets: Record<string, THREE.Object3D>;
  colliders: ColliderDescriptor[];
  destructionGroups: Record<string, THREE.Object3D[]>;
  clips?: THREE.AnimationClip[];
  rig?: RigRuntime;
  bounds: THREE.Box3;
  semanticRegions: Record<string, THREE.Object3D[]>;
}
export type AssetFactory = () => AssetFactoryResult | Promise<AssetFactoryResult>;

export class AssetRegistry {
  private factories = new Map<string, AssetFactory>();
  register(assetId: string, factory: AssetFactory): void { if (this.factories.has(assetId)) throw new Error(`Duplicate assetId: ${assetId}`); this.factories.set(assetId, factory); }
  async create(assetId: string): Promise<AssetFactoryResult> {
    const factory = this.factories.get(assetId); if (!factory) throw new Error(`Unknown assetId: ${assetId}`);
    const result = await factory(); result.root.userData.assetId = assetId; result.root.userData.assetRuntime = { nodes: result.nodes, sockets: result.sockets, colliders: result.colliders };
    return result;
  }
}
