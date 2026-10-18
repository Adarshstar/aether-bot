/**
 * ItemStackRequest (0x93) — protocol 2193 simplified encoder
 * Covers craft creative, take/place stack actions used for craft & containers.
 */

import { BinaryWriter } from "./binary";
import { PacketId } from "./packets";

/** Bedrock ItemStackRequest action type ids (subset) */
export const StackRequestAction = {
  Take: 0,
  Place: 1,
  Swap: 2,
  Drop: 3,
  Destroy: 4,
  Consume: 5,
  Create: 6,
  PlaceInInventory: 7,
  CraftRecipe: 9,
  CraftRecipeAuto: 10,
  CraftCreative: 11,
  CraftRecipeOptional: 13,
  CraftGrindstone: 15,
  CraftLoom: 16,
  MineBlock: 18,
  CraftRecipeWithRecipeId: 26,
} as const;

export interface StackRequestSlotInfo {
  containerId: number;
  slot: number;
  stackNetworkId?: number;
}

let requestIdSeq = 1;
export function nextStackRequestId(): number {
  const id = requestIdSeq++;
  if (requestIdSeq > 0x7fffffff) requestIdSeq = 1;
  return id;
}

function writeSlot(w: BinaryWriter, s: StackRequestSlotInfo) {
  w.writeU8(s.containerId & 0xff);
  w.writeU8(s.slot & 0xff);
  w.writeVarInt(s.stackNetworkId ?? 0);
}

/**
 * Build a single ItemStackRequest packet payload with one CraftRecipeAuto-style action
 * plus optional result place into inventory.
 */
export function encodeItemStackRequest(opts: {
  requestId?: number;
  actions: Array<
    | { type: "craft_recipe"; recipeNetworkId: number; timesCrafted?: number }
    | { type: "craft_creative"; itemId: number }
    | { type: "take"; count: number; from: StackRequestSlotInfo; to: StackRequestSlotInfo }
    | { type: "place"; count: number; from: StackRequestSlotInfo; to: StackRequestSlotInfo }
    | { type: "swap"; a: StackRequestSlotInfo; b: StackRequestSlotInfo }
    | { type: "consume"; count: number; source: StackRequestSlotInfo }
  >;
  filterStrings?: string[];
}): { id: number; payload: Buffer; requestId: number } {
  const requestId = opts.requestId ?? nextStackRequestId();
  const w = new BinaryWriter();
  // requests count
  w.writeVarInt(1);
  w.writeVarInt(requestId);
  w.writeVarInt(opts.actions.length);

  for (const a of opts.actions) {
    switch (a.type) {
      case "take":
        w.writeU8(StackRequestAction.Take);
        w.writeU8(a.count & 0xff);
        writeSlot(w, a.from);
        writeSlot(w, a.to);
        break;
      case "place":
        w.writeU8(StackRequestAction.Place);
        w.writeU8(a.count & 0xff);
        writeSlot(w, a.from);
        writeSlot(w, a.to);
        break;
      case "swap":
        w.writeU8(StackRequestAction.Swap);
        writeSlot(w, a.a);
        writeSlot(w, a.b);
        break;
      case "consume":
        w.writeU8(StackRequestAction.Consume);
        w.writeU8(a.count & 0xff);
        writeSlot(w, a.source);
        break;
      case "craft_recipe":
        w.writeU8(StackRequestAction.CraftRecipe);
        w.writeVarInt(a.recipeNetworkId);
        w.writeU8(a.timesCrafted ?? 1);
        break;
      case "craft_creative":
        w.writeU8(StackRequestAction.CraftCreative);
        w.writeVarInt(a.itemId);
        break;
      default:
        break;
    }
  }

  // filter strings (custom names) — empty
  const filters = opts.filterStrings ?? [];
  w.writeVarInt(filters.length);
  for (const s of filters) w.writeString(s);

  return { id: PacketId.ItemStackRequest, payload: w.toBuffer(), requestId };
}

/** Convenience: transfer count items between two slots (same or different containers) */
export function buildTransferRequest(
  from: StackRequestSlotInfo,
  to: StackRequestSlotInfo,
  count: number
) {
  return encodeItemStackRequest({
    actions: [{ type: "place", count, from, to }],
  });
}
