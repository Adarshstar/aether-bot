import { describe, test, expect } from "bun:test";
import { encodeItemStackRequest, buildTransferRequest, StackRequestAction } from "../src/protocol/itemStackRequest";
import { applyStartGameData } from "../src/registry/applyStartGame";
import { BlockRegistry } from "../src/registry/blocks";
import { PacketId } from "../src/protocol/packets";

describe("ItemStackRequest + StartGame palette", () => {
  test("encodes place transfer", () => {
    const pkt = buildTransferRequest(
      { containerId: 0, slot: 0 },
      { containerId: 0, slot: 1 },
      16
    );
    expect(pkt.id).toBe(PacketId.ItemStackRequest);
    expect(pkt.payload.length).toBeGreaterThan(4);
    expect(pkt.requestId).toBeGreaterThan(0);
  });

  test("encodes craft creative action", () => {
    const pkt = encodeItemStackRequest({
      actions: [{ type: "craft_creative", itemId: 280 }],
    });
    expect(pkt.payload[0]).toBeDefined();
  });

  test("applyStartGame merges unknown block names", () => {
    const before = BlockRegistry.size();
    applyStartGameData({
      blockPalette: [{ name: "minecraft:calcite", runtimeId: 20001 }],
      itemPalette: [{ name: "minecraft:echo_shard", networkId: 20002 }],
    });
    expect(BlockRegistry.size()).toBeGreaterThanOrEqual(before);
    expect(BlockRegistry.get(20001).name).toBe("calcite");
  });
});
