import { describe, test, expect } from "bun:test";
import {
  encodeGamePacket, decodeGamePacket, getRegisteredCodecIds,
  buildOfflineChain, generateBedrockKeyPair,
  PacketId, ItemRegistry, XboxAuth,
} from "../index";

describe("Binary codecs", () => {
  test("registered codecs exist", () => {
    const ids = getRegisteredCodecIds();
    expect(ids.length).toBeGreaterThan(5);
    expect(ids).toContain(PacketId.Text);
    expect(ids).toContain(PacketId.PlayerAuthInput);
  });

  test("text packet roundtrip", () => {
    const framed = encodeGamePacket(PacketId.Text, {
      message: "hello",
      sourceName: "Bot",
    });
    const { id, data } = decodeGamePacket(framed);
    expect(id).toBe(PacketId.Text);
    expect(data.message).toBe("hello");
    expect(data.sourceName).toBe("Bot");
  });

  test("request network settings roundtrip", () => {
    const framed = encodeGamePacket(PacketId.RequestNetworkSettings, {
      clientNetworkVersion: 2193,
    });
    const { data } = decodeGamePacket(framed);
    expect(data.clientNetworkVersion).toBe(2193);
  });
});

describe("JWT chain", () => {
  test("offline chain produces ES384 JWT", () => {
    const chain = buildOfflineChain("TestPlayer");
    expect(chain.chain.length).toBeGreaterThanOrEqual(1);
    expect(chain.multiplayerToken.split(".")).toHaveLength(3);
    expect(chain.keyPair.x509.length).toBeGreaterThan(40);
    expect(chain.displayName).toBe("TestPlayer");
    expect(chain.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("keypair generation", () => {
    const kp = generateBedrockKeyPair();
    expect(kp.privateKeyPem).toContain("PRIVATE KEY");
    expect(kp.publicKeyPem).toContain("PUBLIC KEY");
  });
});

describe("XboxAuth offline with chain", () => {
  test("returns chain + multiplayerToken", async () => {
    const auth = new XboxAuth({ username: "ChainBot", offline: true });
    const r = await auth.authenticate();
    expect(r.chain?.length).toBeGreaterThan(0);
    expect(r.multiplayerToken).toBeTruthy();
    expect(r.keyPair?.x509).toBeTruthy();
  });
});

describe("ItemRegistry", () => {
  test("palette size and tools", () => {
    expect(ItemRegistry.size()).toBeGreaterThan(40);
    expect(ItemRegistry.get(278).name).toContain("pickaxe");
    expect(ItemRegistry.getByName("diamond")?.networkId).toBe(264);
  });
});
