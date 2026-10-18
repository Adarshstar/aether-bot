/**
 * Entity model – modern prismarine-entity equivalent
 */

import { Vec3 } from "../math/Vec3";
import { EntityRegistry, type EntityDef } from "../registry/entities";
import type { Entity as EntityInterface } from "../types";

export class EntityModel implements EntityInterface {
  id: number;
  type: string;
  username?: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  onGround: boolean;
  health?: number;
  metadata?: Record<string, any>;

  width: number;
  height: number;
  category: string;
  typeId: number;

  constructor(typeId: number, id: number, pos: Vec3, extra: Partial<EntityInterface> = {}) {
    const def = EntityRegistry.get(typeId);
    this.typeId = typeId;
    this.id = id;
    this.type = def.name;
    this.position = { x: pos.x, y: pos.y, z: pos.z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.health = def.maxHealth;
    this.width = def.width;
    this.height = def.height;
    this.category = def.category;
    this.metadata = { typeId, width: def.width, height: def.height, category: def.category };
    Object.assign(this, extra);
  }

  get pos(): Vec3 {
    return Vec3.from(this.position);
  }

  distanceTo(other: { position: { x: number; y: number; z: number } }): number {
    return this.pos.distanceTo(Vec3.from(other.position));
  }

  get isHostile(): boolean {
    return EntityRegistry.isHostile(this.typeId);
  }

  get isPlayer(): boolean {
    return this.type === "player" || this.category === "player";
  }
}
