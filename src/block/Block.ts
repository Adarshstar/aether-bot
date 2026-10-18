/**
 * Block instance – modern prismarine-block equivalent
 */

import { Vec3 } from "../math/Vec3";
import { BlockRegistry, type BlockDef } from "../registry/blocks";

export class Block {
  readonly type: number;
  readonly name: string;
  readonly position: Vec3;
  readonly hardness: number;
  readonly solid: boolean;
  readonly passable: boolean;
  readonly liquid: boolean;
  readonly transparent: boolean;
  readonly tool: BlockDef["tool"];
  readonly displayName: string;
  metadata: number;
  stateId: number;

  constructor(type: number, position: Vec3, metadata = 0) {
    const def = BlockRegistry.get(type);
    this.type = type;
    this.name = def.name;
    this.displayName = def.displayName ?? def.name;
    this.position = position.clone();
    this.hardness = def.hardness;
    this.solid = def.solid;
    this.passable = def.passable;
    this.liquid = !!def.liquid;
    this.transparent = !!def.transparent;
    this.tool = def.tool ?? "none";
    this.metadata = metadata;
    this.stateId = type; // simplified
  }

  get diggable(): boolean {
    return this.solid && isFinite(this.hardness);
  }

  static fromWorld(world: { getBlock(x: number, y: number, z: number): number }, x: number, y: number, z: number): Block {
    return new Block(world.getBlock(x, y, z), new Vec3(x, y, z));
  }
}
