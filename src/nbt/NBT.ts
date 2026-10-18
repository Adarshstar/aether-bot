/**
 * Minimal NBT helpers – modern prismarine-nbt inspired (Bedrock-friendly)
 * Full binary NBT can be expanded; this covers common tag tree ops
 */

export type NBTValue =
  | number
  | string
  | boolean
  | NBTValue[]
  | { [key: string]: NBTValue }
  | Buffer
  | null;

export interface NBTCompound {
  [key: string]: NBTValue;
}

export const NBT = {
  compound(obj: NBTCompound = {}): NBTCompound {
    return { ...obj };
  },

  getString(nbt: NBTCompound | null | undefined, path: string, fallback = ""): string {
    const v = NBT.get(nbt, path);
    return typeof v === "string" ? v : fallback;
  },

  getNumber(nbt: NBTCompound | null | undefined, path: string, fallback = 0): number {
    const v = NBT.get(nbt, path);
    return typeof v === "number" ? v : fallback;
  },

  get(nbt: NBTCompound | null | undefined, path: string): NBTValue {
    if (!nbt) return null;
    const parts = path.split(".");
    let cur: any = nbt;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return null;
      cur = cur[p];
    }
    return cur ?? null;
  },

  set(nbt: NBTCompound, path: string, value: NBTValue): NBTCompound {
    const parts = path.split(".");
    let cur: any = nbt;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return nbt;
  },

  simplify(nbt: NBTValue): any {
    return nbt; // placeholder for typed tag unwrapping
  },
};
