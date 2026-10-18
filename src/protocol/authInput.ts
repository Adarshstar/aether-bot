/**
 * PlayerAuthInput flags for protocol 2193 (BDS 1.26.52.3)
 *
 * InputData is a fixed-size std::bitset serialized as 7-bit-payload bytes
 * with a continuation bit (PMMP / Bedrock BitSet). Bit 0 = Ascend.
 *
 * Current Bedrock uses 67 flags (0..66). We always write ceil(67/7) = 10 bytes
 * so the server can address high bits (StartFlying, collisions, raw sneak…).
 */

export const InputFlag = {
  Ascend: 0,
  Descend: 1,
  NorthJump: 2,
  JumpDown: 3,
  SprintDown: 4,
  ChangeHeight: 5,
  Jumping: 6,
  AutoJumpingInWater: 7,
  Sneaking: 8,
  SneakDown: 9,
  Up: 10,
  Down: 11,
  Left: 12,
  Right: 13,
  UpLeft: 14,
  UpRight: 15,
  WantUp: 16,
  WantDown: 17,
  WantDownSlow: 18,
  WantUpSlow: 19,
  Sprinting: 20,
  AscendBlock: 21,
  DescendBlock: 22,
  SneakToggleDown: 23,
  PersistSneak: 24,
  StartSprinting: 25,
  StopSprinting: 26,
  StartSneaking: 27,
  StopSneaking: 28,
  StartSwimming: 29,
  StopSwimming: 30,
  StartJumping: 31,
  StartGliding: 32,
  StopGliding: 33,
  PerformItemInteraction: 34,
  PerformBlockActions: 35,
  PerformItemStackRequest: 36,
  HandledTeleport: 37,
  Emoting: 38,
  MissedSwing: 39,
  StartCrawling: 40,
  StopCrawling: 41,
  StartFlying: 42,
  StopFlying: 43,
  ClientAckServerData: 44,
  ClientPredictedVehicle: 45,
  PaddlingLeft: 46,
  PaddlingRight: 47,
  BlockBreakingDelayEnabled: 48,
  HorizontalCollision: 49,
  VerticalCollision: 50,
  DownLeft: 51,
  DownRight: 52,
  StartUsingItem: 53,
  CameraRelativeMovementEnabled: 54,
  RotControlledByMoveDirection: 55,
  StartSpinAttack: 56,
  StopSpinAttack: 57,
  IsHotbarTouchOnly: 58,
  JumpReleasedRaw: 59,
  JumpPressedRaw: 60,
  JumpCurrentRaw: 61,
  SneakReleasedRaw: 62,
  SneakPressedRaw: 63,
  SneakCurrentRaw: 64,
  InternalUpdate: 65,
  Count: 66,
} as const;

export type InputFlagName = keyof typeof InputFlag;

/** Bit count written on the wire for protocol 2193 */
export const PLAYER_AUTH_INPUT_BITS = InputFlag.Count;

const SHIFT = 7;

export function encodeBitset(flags: number | bigint, bitCount = PLAYER_AUTH_INPUT_BITS): Buffer {
  let value = typeof flags === "bigint" ? flags : BigInt(flags >>> 0);
  const bytes: number[] = [];
  for (let i = 0; i < bitCount; i += SHIFT) {
    const last = i + SHIFT >= bitCount;
    let bits = Number(value & 0x7fn);
    value >>= 7n;
    if (!last) bits |= 0x80;
    bytes.push(bits);
  }
  return Buffer.from(bytes);
}

export function decodeBitset(buf: Buffer, offset = 0, bitCount = PLAYER_AUTH_INPUT_BITS): {
  value: bigint;
  bytesRead: number;
} {
  let value = 0n;
  let shift = 0n;
  let i = 0;
  const maxBytes = Math.ceil(bitCount / SHIFT);
  while (i < maxBytes) {
    const b = buf[offset + i];
    if (b === undefined) break;
    value |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    i++;
    if ((b & 0x80) === 0) break;
  }
  return { value, bytesRead: i };
}

export function flagBit(flag: number): bigint {
  return 1n << BigInt(flag);
}

export function hasFlag(bits: bigint | number, flag: number): boolean {
  const v = typeof bits === "bigint" ? bits : BigInt(bits >>> 0);
  return (v & flagBit(flag)) !== 0n;
}

export function setFlag(bits: bigint | number, flag: number, on = true): bigint {
  const v = typeof bits === "bigint" ? bits : BigInt(bits >>> 0);
  return on ? v | flagBit(flag) : v & ~flagBit(flag);
}

export interface MovementControls {
  forward?: boolean;
  back?: boolean;
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  sneak?: boolean;
  sprint?: boolean;
  /** In water / lava swimming */
  swim?: boolean;
  /** Elytra gliding */
  glide?: boolean;
  /** Creative / spectator flying */
  fly?: boolean;
  /** Ascend while flying / swimming */
  ascend?: boolean;
  /** Descend while flying / swimming */
  descend?: boolean;
}

/**
 * Map WASD-style controls onto 2193 input flags + analogue move vector.
 * Move vector: X = strafe (left -, right +), Z = forward (+1) / back (-1)
 * matching Bedrock's PlayerAuthInput move vector convention.
 *
 * Also handles swim / glide / fly edge cases required by BDS 1.26.52.3.
 */
export function flagsFromControls(c: MovementControls, prev: MovementControls = {}): bigint {
  let bits = 0n;
  const up = !!c.forward;
  const down = !!c.back;
  const left = !!c.left;
  const right = !!c.right;

  if (up && !left && !right) bits = setFlag(bits, InputFlag.Up);
  if (down && !left && !right) bits = setFlag(bits, InputFlag.Down);
  if (left && !up && !down) bits = setFlag(bits, InputFlag.Left);
  if (right && !up && !down) bits = setFlag(bits, InputFlag.Right);
  if (up && left) bits = setFlag(bits, InputFlag.UpLeft);
  if (up && right) bits = setFlag(bits, InputFlag.UpRight);
  if (down && left) bits = setFlag(bits, InputFlag.DownLeft);
  if (down && right) bits = setFlag(bits, InputFlag.DownRight);

  if (c.jump) {
    bits = setFlag(bits, InputFlag.Jumping);
    bits = setFlag(bits, InputFlag.JumpDown);
    bits = setFlag(bits, InputFlag.WantUp);
    bits = setFlag(bits, InputFlag.JumpCurrentRaw);
    bits = setFlag(bits, InputFlag.JumpPressedRaw);
    if (!prev.jump) bits = setFlag(bits, InputFlag.StartJumping);
  } else if (prev.jump) {
    bits = setFlag(bits, InputFlag.JumpReleasedRaw);
  }

  if (c.sneak) {
    bits = setFlag(bits, InputFlag.Sneaking);
    bits = setFlag(bits, InputFlag.SneakDown);
    bits = setFlag(bits, InputFlag.PersistSneak);
    bits = setFlag(bits, InputFlag.SneakCurrentRaw);
    bits = setFlag(bits, InputFlag.SneakPressedRaw);
    if (!prev.sneak) bits = setFlag(bits, InputFlag.StartSneaking);
  } else if (prev.sneak) {
    bits = setFlag(bits, InputFlag.StopSneaking);
    bits = setFlag(bits, InputFlag.SneakReleasedRaw);
  }

  if (c.sprint) {
    bits = setFlag(bits, InputFlag.Sprinting);
    bits = setFlag(bits, InputFlag.SprintDown);
    if (!prev.sprint) bits = setFlag(bits, InputFlag.StartSprinting);
  } else if (prev.sprint) {
    bits = setFlag(bits, InputFlag.StopSprinting);
  }

  // Swimming
  if (c.swim) {
    bits = setFlag(bits, InputFlag.AutoJumpingInWater);
    if (!prev.swim) bits = setFlag(bits, InputFlag.StartSwimming);
  } else if (prev.swim) {
    bits = setFlag(bits, InputFlag.StopSwimming);
  }

  // Elytra gliding
  if (c.glide) {
    if (!prev.glide) bits = setFlag(bits, InputFlag.StartGliding);
  } else if (prev.glide) {
    bits = setFlag(bits, InputFlag.StopGliding);
  }

  // Creative / spectator flying
  if (c.fly) {
    if (!prev.fly) bits = setFlag(bits, InputFlag.StartFlying);
  } else if (prev.fly) {
    bits = setFlag(bits, InputFlag.StopFlying);
  }

  // Ascend / descend (fly + swim vertical)
  if (c.ascend) {
    bits = setFlag(bits, InputFlag.Ascend);
    bits = setFlag(bits, InputFlag.WantUp);
    bits = setFlag(bits, InputFlag.ChangeHeight);
  }
  if (c.descend) {
    bits = setFlag(bits, InputFlag.Descend);
    bits = setFlag(bits, InputFlag.WantDown);
    bits = setFlag(bits, InputFlag.ChangeHeight);
  }

  return bits;
}

export function moveVectorFromControls(c: MovementControls): { x: number; z: number } {
  let x = 0;
  let z = 0;
  if (c.left) x -= 1;
  if (c.right) x += 1;
  if (c.forward) z += 1;
  if (c.back) z -= 1;
  const mag = Math.hypot(x, z);
  if (mag > 1) {
    x /= mag;
    z /= mag;
  }
  return { x, z };
}

export const InputMode = {
  Undefined: 0,
  Mouse: 1,
  Touch: 2,
  GamePad: 3,
  MotionController: 4,
} as const;

export const PlayMode = {
  Normal: 0,
  Teaser: 1,
  Screen: 2,
  Viewer: 3,
  Reality: 4,
  Placement: 5,
  LivingRoom: 6,
  ExitLevel: 7,
  ExitLevelLivingRoom: 8,
} as const;

export const InteractionModel = {
  Touch: 0,
  Crosshair: 1,
  Classic: 2,
} as const;
