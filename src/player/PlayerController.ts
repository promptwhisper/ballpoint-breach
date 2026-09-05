import * as THREE from 'three';
import type { InputFrame } from '../input/InputManager';
import { PhysicsWorld, type CapsuleBodyState, type CapsuleConfig } from '../physics/PhysicsWorld';

export interface PlayerSnapshot {
  health: number;
  maxHealth: number;
  grounded: boolean;
  sprinting: boolean;
  speed: number;
  gaitPhase: number;
  gaitWeight: number;
  position: THREE.Vector3;
}

const CAPSULE: CapsuleConfig = {
  radius: 0.34,
  height: 1.72,
  stepHeight: 0.46,
  gravity: 25,
};

export class PlayerController {
  readonly body: CapsuleBodyState = {
    position: new THREE.Vector3(0, 0, 8),
    velocity: new THREE.Vector3(),
    grounded: false,
  };

  readonly maxHealth = 100;
  health = this.maxHealth;
  sensitivity = 0.00185;
  enabled = false;
  yaw = 0;
  pitch = 0;

  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilVelocityPitch = 0;
  private recoilVelocityYaw = 0;
  private gaitPhase = 0;
  private gaitWeight = 0;
  private landingKick = 0;
  private shake = 0;
  private fovTarget = 68;
  private wasGrounded = false;
  private sprinting = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly physics: PhysicsWorld,
    readonly safeSpawn = new THREE.Vector3(0, 0.05, 8),
  ) {
    camera.rotation.order = 'YXZ';
    this.teleport(safeSpawn);
  }

  update(dt: number, input: InputFrame): void {
    const safeDt = Math.min(dt, 0.05);
    if (this.enabled) {
      this.yaw -= input.lookX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookY * this.sensitivity, -Math.PI * 0.485, Math.PI * 0.485);
    }

    const movementLength = Math.hypot(input.moveX, input.moveZ);
    const moveX = movementLength > 1 ? input.moveX / movementLength : input.moveX;
    const moveZ = movementLength > 1 ? input.moveZ / movementLength : input.moveZ;
    this.sprinting = this.enabled && input.sprint && moveZ > 0.1 && movementLength > 0;
    const targetSpeed = this.sprinting ? 10.2 : 8.4;
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const desiredX = this.enabled ? (forwardX * moveZ + rightX * moveX) * targetSpeed : 0;
    const desiredZ = this.enabled ? (forwardZ * moveZ + rightZ * moveX) * targetSpeed : 0;
    const acceleration = this.body.grounded ? 18 : 9;
    const blend = 1 - Math.exp(-acceleration * safeDt);
    this.body.velocity.x = THREE.MathUtils.lerp(this.body.velocity.x, desiredX, blend);
    this.body.velocity.z = THREE.MathUtils.lerp(this.body.velocity.z, desiredZ, blend);

    if (this.enabled && input.jumpPressed && this.body.grounded) {
      this.body.velocity.y = 8.3;
      this.body.grounded = false;
    }

    this.physics.moveCapsule(this.body, safeDt, CAPSULE);
    if (!this.wasGrounded && this.body.grounded && this.body.velocity.y === 0) this.landingKick = Math.min(0.075, this.landingKick + 0.045);
    this.wasGrounded = this.body.grounded;

    if (this.body.position.y < -12) {
      this.health = Math.max(1, this.health - 10);
      this.teleport(this.safeSpawn);
    }

    this.updateCamera(safeDt, movementLength);
  }

  setFovTarget(value: number): void {
    this.fovTarget = value;
  }

  addRecoil(pitch: number, yaw = 0): void {
    this.recoilVelocityPitch += pitch;
    this.recoilVelocityYaw += yaw;
  }

  applyDamage(amount: number): boolean {
    if (amount <= 0 || this.health <= 0) return this.health <= 0;
    this.health = Math.max(0, this.health - amount);
    this.shake = Math.min(0.06, this.shake + amount * 0.0012);
    return this.health <= 0;
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + Math.max(0, amount));
  }

  restore(): void {
    this.health = this.maxHealth;
    this.body.velocity.set(0, 0, 0);
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelocityPitch = 0;
    this.recoilVelocityYaw = 0;
    this.gaitPhase = 0;
    this.gaitWeight = 0;
    this.landingKick = 0;
    this.shake = 0;
    this.fovTarget = 68;
    this.wasGrounded = false;
    this.sprinting = false;
    this.camera.fov = 68;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateProjectionMatrix();
    this.teleport(this.safeSpawn);
  }

  teleport(position: THREE.Vector3): void {
    this.body.position.copy(position);
    this.body.velocity.set(0, 0, 0);
    this.body.grounded = false;
    this.syncCameraPosition(0, 0);
  }

  getAimOrigin(target = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldPosition(target);
  }

  getAimDirection(target = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldDirection(target).normalize();
  }

  getSnapshot(): PlayerSnapshot {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      grounded: this.body.grounded,
      sprinting: this.sprinting,
      speed: Math.hypot(this.body.velocity.x, this.body.velocity.z),
      gaitPhase: this.gaitPhase,
      gaitWeight: this.gaitWeight,
      position: this.body.position.clone(),
    };
  }

  private updateCamera(dt: number, movementLength: number): void {
    const spring = 115;
    const damping = 19;
    this.recoilVelocityPitch += (-this.recoilPitch * spring - this.recoilVelocityPitch * damping) * dt;
    this.recoilVelocityYaw += (-this.recoilYaw * spring - this.recoilVelocityYaw * damping) * dt;
    this.recoilPitch += this.recoilVelocityPitch * dt;
    this.recoilYaw += this.recoilVelocityYaw * dt;
    this.landingKick = THREE.MathUtils.lerp(this.landingKick, 0, 1 - Math.exp(-12 * dt));
    this.shake = THREE.MathUtils.lerp(this.shake, 0, 1 - Math.exp(-15 * dt));

    const horizontalSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    const movingOnGround = this.body.grounded && movementLength > 0.05 && horizontalSpeed > 0.08;
    const cycleDistance = this.sprinting ? 5.5 : 5.0;
    if (movingOnGround) this.gaitPhase += (horizontalSpeed * dt / cycleDistance) * Math.PI * 2;
    const targetGaitWeight = movingOnGround ? THREE.MathUtils.clamp(horizontalSpeed / 8.4, 0, 1.08) : 0;
    this.gaitWeight = THREE.MathUtils.lerp(this.gaitWeight, targetGaitWeight, 1 - Math.exp(-10 * dt));
    const bobX = Math.sin(this.gaitPhase) * 0.003 * this.gaitWeight;
    const bobY = Math.cos(this.gaitPhase * 2) * 0.002 * this.gaitWeight - this.landingKick;
    const shakeX = Math.sin(this.gaitPhase * 5.73 + 0.6) * this.shake;
    const shakeY = Math.cos(this.gaitPhase * 4.91 + 1.4) * this.shake;
    this.syncCameraPosition(bobX + shakeX, bobY + shakeY);
    const gaitRoll = -Math.sin(this.gaitPhase) * 0.00045 * this.gaitWeight;
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, gaitRoll + shakeX * 0.05, 'YXZ');
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.fovTarget, 1 - Math.exp(-12 * dt));
    this.camera.updateProjectionMatrix();
  }

  private syncCameraPosition(horizontalOffset: number, verticalOffset: number): void {
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    this.camera.position.set(
      this.body.position.x + rightX * horizontalOffset,
      this.body.position.y + 1.58 + verticalOffset,
      this.body.position.z + rightZ * horizontalOffset,
    );
  }
}
