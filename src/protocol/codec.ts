import { sign } from "node:crypto";
/**
 * Aether packet codec layer — protocol 2193
 * Every PacketId has encode/decode. Critical packets are high-fidelity.
 */

import { BinaryWriter, BinaryReader, encodePacket, decodePacketHeader } from "./binary";
import { PacketId, ProtocolVersion } from "./packets";
import { encodeBitset, decodeBitset, PLAYER_AUTH_INPUT_BITS } from "./authInput";
import { encodeLevelChunkBody, decodeLevelChunkBody } from "../world/levelChunk";
import { encodeNetworkItem, decodeNetworkItem, encodeItemList, decodeItemList } from "./itemStack";
import {
  encodeSubChunkRequest, decodeSubChunkRequest,
  encodeSubChunkPacket, decodeSubChunkPacket,
} from "./subchunk";

export type CodecFn = {
  encode: (data: any) => Buffer;
  decode: (buf: Buffer) => any;
};

const codecs = new Map<number, CodecFn>();
const specialized = new Set<number>();

export function registerCodec(id: number, codec: CodecFn, isSpecialized = false) {
  codecs.set(id, codec);
  if (isSpecialized) specialized.add(id);
}

export function hasCodec(id: number) {
  return codecs.has(id);
}

export function encodeGamePacket(id: number, data: any = {}): Buffer {
  const c = codecs.get(id);
  const payload = c ? c.encode(data ?? {}) : encodeGeneric(data);
  return encodePacket(id, payload);
}

export function decodeGamePacket(buf: Buffer): { id: number; data: any; bytesRead: number } {
  const { id, payload, bytesRead } = decodePacketHeader(buf);
  const c = codecs.get(id);
  const data = c ? c.decode(payload) : decodeGeneric(payload);
  return { id, data, bytesRead };
}

function encodeGeneric(data: any): Buffer {
  if (data == null || (typeof data === "object" && Object.keys(data).length === 0)) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(data)) return data;
  if (data.raw && Buffer.isBuffer(data.raw)) return data.raw;
  return Buffer.from(JSON.stringify(data), "utf8");
}

function decodeGeneric(buf: Buffer): any {
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return { raw: buf, length: buf.length };
  }
}

function emptyCodec(): CodecFn {
  return {
    encode: () => Buffer.alloc(0),
    decode: () => ({}),
  };
}

function stringCodec(field = "value"): CodecFn {
  return {
    encode(data) {
      const w = new BinaryWriter();
      w.writeString(data?.[field] ?? data?.message ?? "");
      return w.toBuffer();
    },
    decode(buf) {
      if (!buf.length) return { [field]: "" };
      return { [field]: new BinaryReader(buf).readString() };
    },
  };
}

function varIntCodec(field: string): CodecFn {
  return {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarInt(data?.[field] ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      return { [field]: buf.length ? new BinaryReader(buf).readVarInt() : 0 };
    },
  };
}

function varLongCodec(field: string): CodecFn {
  return {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarLong(BigInt(data?.[field] ?? 0));
      return w.toBuffer();
    },
    decode(buf) {
      return { [field]: buf.length ? Number(new BinaryReader(buf).readVarLong()) : 0 };
    },
  };
}

function registerAll() {
  for (const key of Object.keys(PacketId)) {
    const id = (PacketId as any)[key];
    if (typeof id === "number" && !codecs.has(id)) {
      registerCodec(id, { encode: encodeGeneric, decode: decodeGeneric });
    }
  }

  registerCodec(PacketId.RequestNetworkSettings, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeI32BE(data.clientNetworkVersion ?? ProtocolVersion);
      return w.toBuffer();
    },
    decode(buf) {
      return { clientNetworkVersion: new BinaryReader(buf).readI32BE() };
    },
  }, true);

  registerCodec(PacketId.NetworkSettings, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeU16(data.compressionThreshold ?? 1);
      w.writeU16(data.compressionAlgorithm ?? 0);
      w.writeU8(data.clientThrottle ?? 0);
      w.writeU8(data.clientThrottleThreshold ?? 0);
      w.writeF32(data.clientThrottleScalar ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        compressionThreshold: r.readU16(),
        compressionAlgorithm: r.readU16(),
        clientThrottle: r.remaining ? r.readU8() : 0,
        clientThrottleThreshold: r.remaining ? r.readU8() : 0,
        clientThrottleScalar: r.remaining ? r.readF32() : 0,
      };
    },
  }, true);

  registerCodec(PacketId.Login, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeI32BE(data.protocol ?? ProtocolVersion);
      // 1.21.90+ / protocol ~818+: identity envelope with Certificate + AuthenticationType + Token
      const chainArr = data.chain ?? [];
      // Prefer 1.21.90+ envelope; fall back to legacy {chain} when explicitly requested
      const useEnvelope = data.legacyIdentity !== true;
      const chainStr = useEnvelope
        ? JSON.stringify({
            Certificate: JSON.stringify({ chain: chainArr }),
            AuthenticationType: data.offline ? 2 : 0,
            Token: data.multiplayerToken ?? data.token ?? "",
          })
        : JSON.stringify({ chain: chainArr });

      // Client data MUST be an ES384 JWT (not raw JSON). Plain JSON is rejected by BDS.
      let clientJwt: string;
      if (typeof data.clientJwt === "string" && data.clientJwt.includes(".")) {
        clientJwt = data.clientJwt;
      } else {
                // Real Steve 64x64 RGBA skin
        const skinDataB64 = "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cnJz/3Fxcf92dnb/c3Nz/2hoaP9jY2P/ZWVl/2BgYP9ubm7/ampr/2lpaf9vb2//aGho/5ycnP/w8PD/+/v7//r6+v/w8PD/nZ2d/2hoaP9vb2//ampq/2xsbP9vb2//aWlp/2xsbP9ubm7/bm5u/1lZWf/l5eX/ZWVl/25ubv9wcHD/ampq/21tbf9ubm7/ampq/29vb/9zc3P/bm5u/2ZmZv9paWn/a2tr/2tra/9qamr/ampq/2xsbP9vb2//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//////f39//r6+v/9/f3/////////////////9/f3//f39//z8/P/+fn5//Pz8//e3t7/1tbW/9jY2P/S0tL/bGxs/2pqav9qamr/cHBw/2xsbP/W1tb//v7+///////////////+/9fX1/9sbGz/cXFx/2xsbP9sbGz/bm5u/2tra/9vb2//cHBw/3BwcP9ZWVn/5eXl/1lZWf9sbGz//f39//X19f/4+Pj/+fn5//b29v/9/f3//v7+/+7u7v///////v7+//39/f/5+fn/9vb2//X19f/29vb/+Pj4/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/f39///////////////+//Ly8v/p6en/9vb2/////////////Pz8///////5+fn/4+Pj/9vb2//f39//29vb/2tra/9sbGz/bGxs/29vb/9ubm7/7u7u//f39//39Pf/9/T3//f39//t7e3/bm5u/29vb/9tbW3/bW1t/2xsbP9ra2v/bW1t/3BwcP9ZWVn/5eXl/1lZWf9sbGz/bGxs//v7+//39/f//Pz8//r6+v/z8/P/+/v7//39/f/v7+7/+/v7//n5+f/4+Pj/+Pj4//n5+f/6+vr/+fn5//f39/8AAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAL6+vv/w8PD/vr6+//////++vr7//////76+vv/z8/P/vr6+//f39/++vr7/9PT0/93d3f/X19f/3d3d/9ra2v9sbGz/bm5u/21tbf9ubm7/bGxs/25ubv/W1tf/9u30//bt9P/W1tb/bm5u/2xsbP9tbW3/bW1t/25ub/9sbGz/b29v/3BwcP9ZWVn/3t7e/1lZWf9vb2//bm5u/21tbf/4+Pj/vr6+//////++vr//7+/v/76+vv//////vr6+//X19f++vr7/9PT0/76+vv/8/Pz/vr6+//j4+P++vr7/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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";
        const geomVerB64 = Buffer.from("0.0.0").toString("base64");
        const payload: Record<string, unknown> = {
          AnimatedImageData: [],
          ArmSize: "wide",
          CapeData: "",
          CapeId: "",
          CapeImageHeight: 0,
          CapeImageWidth: 0,
          CapeOnClassicSkin: false,
          ClientRandomId: data.clientRandomId ?? Date.now(),
          CompatibleWithClientSideChunkGen: false,
          CurrentInputMode: 1,
          DefaultInputMode: 1,
          DeviceId: data.uuid ?? data.deviceId ?? "aether-device",
          DeviceModel: "Aether",
          DeviceOS: data.deviceOS ?? 1, // Android
          GameVersion: "1.26.52",
          GuiScale: 0,
          IsEditorMode: false,
          LanguageCode: "en_US",
          OverrideSkin: false,
          PersonaPieces: [],
          PersonaSkin: false,
          PieceTintColors: [],
          PlatformOfflineId: "",
          PlatformOnlineId: data.xuid ? String(data.xuid) : "",
          PlayFabId: (data.uuid ?? "0000000000000000").replace(/-/g, "").slice(0, 16).toLowerCase(),
          PremiumSkin: false,
          SelfSignedId: data.uuid ?? "",
          ServerAddress: data.serverAddress ?? "",
          SkinAnimationData: "",
          SkinColor: "#C89B78",
          SkinData: skinDataB64,
          SkinGeometryData: "",
          SkinGeometryDataEngineVersion: geomVerB64,
          SkinId: data.uuid ?? "Standard_Custom",
          SkinImageHeight: 64,
          SkinImageWidth: 64,
          SkinResourcePatch: Buffer.from(
            JSON.stringify({ geometry: { default: "geometry.humanoid.custom" } })
          ).toString("base64"),
          ThirdPartyName: data.username ?? "",
          TrustedSkin: true,
          UIProfile: 0,
        };
        if (data.privateKeyPem) {
          const b64url = (buf: Buffer | string) =>
            Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
          const header = { alg: "ES384", x5u: data.identityPublicKey ?? data.x509 ?? "" };
          const h = b64url(JSON.stringify(header));
          const p = b64url(JSON.stringify(payload));
          const signingInput = `${h}.${p}`;
          const sig = sign("SHA384", Buffer.from(signingInput), {
            key: data.privateKeyPem,
            dsaEncoding: "ieee-p1363",
          });
          clientJwt = `${signingInput}.${b64url(sig)}`;
        } else {
          // Offline fallback: unsigned JSON (may still be rejected by online BDS)
          clientJwt = JSON.stringify(payload);
        }
      }

      const inner = new BinaryWriter();
      const chainBuf = Buffer.from(chainStr, "utf8");
      inner.writeU32(chainBuf.length);
      inner.writeRaw(chainBuf);
      const jwtBuf = Buffer.from(clientJwt, "utf8");
      inner.writeU32(jwtBuf.length);
      inner.writeRaw(jwtBuf);
      const body = inner.toBuffer();
      if (typeof console !== "undefined") {
        console.log(`[Login] authInfoLen=${chainBuf.length} clientJwtLen=${jwtBuf.length} authHead=${chainStr.slice(0, 120)}`);
      }
      w.writeVarInt(body.length);
      return Buffer.concat([w.toBuffer(), body]);
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const protocol = r.readI32BE();
      return { protocol, rawLength: buf.length };
    },
  }, true);

  registerCodec(PacketId.PlayStatus, {
    encode(data) {
      const w = new BinaryWriter();
      const map: Record<string, number> = {
        login_success: 0,
        failed_client: 1,
        failed_spawn: 2,
        player_spawn: 3,
        failed_invalid_tenant: 4,
        failed_vanilla_edu: 5,
        failed_edu_vanilla: 6,
        failed_server_full: 7,
      };
      const status = typeof data.status === "string" ? (map[data.status] ?? 0) : (data.status ?? 0);
      w.writeI32BE(status);
      return w.toBuffer();
    },
    decode(buf) {
      const status = new BinaryReader(buf).readI32BE();
      const names = ["login_success", "failed_client", "failed_spawn", "player_spawn"];
      return { status, statusName: names[status] ?? String(status) };
    },
  }, true);

  registerCodec(PacketId.ServerToClientHandshake, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeString(data.jwt ?? data.token ?? "");
      return w.toBuffer();
    },
    decode(buf) {
      if (!buf.length) return {};
      try { return { jwt: new BinaryReader(buf).readString() }; }
      catch { return { raw: buf }; }
    },
  }, true);
  registerCodec(PacketId.ClientToServerHandshake, emptyCodec(), true);

  registerCodec(PacketId.Disconnect, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarInt(data.reason ?? 0);
      const msg = data.message ?? "";
      w.writeU8(msg ? 1 : 0);
      if (msg) w.writeString(msg);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const reason = r.readVarInt();
      const has = r.remaining ? r.readU8() : 0;
      return { reason, message: has ? r.readString() : "" };
    },
  }, true);

  registerCodec(PacketId.ResourcePacksInfo, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeU8(data.mustAccept ? 1 : 0);
      w.writeU8(data.hasScripts ? 1 : 0);
      w.writeU8(data.forceDisableVibrantVisuals ? 1 : 0);
      w.writeU16(0);
      w.writeU16(0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        mustAccept: !!r.readU8(),
        hasScripts: r.remaining ? !!r.readU8() : false,
      };
    },
  }, true);

  registerCodec(PacketId.ResourcePackStack, {
    encode() {
      const w = new BinaryWriter();
      w.writeU8(0);
      w.writeVarInt(0);
      w.writeVarInt(0);
      w.writeString("");
      return w.toBuffer();
    },
    decode: decodeGeneric,
  });

  registerCodec(PacketId.ResourcePackClientResponse, {
    encode(data) {
      const w = new BinaryWriter();
      // 1.26+ (gophertunnel): Varuint32 response + string name [+ pack list if downloading]
      // 0 cancel, 1 downloading, 2 downloadingfinished, 3 resourcepackstackfinished
      const map: Record<string, number> = {
        refused: 0, cancel: 0,
        send_packs: 1, downloading: 1,
        have_all_packs: 2, downloadingfinished: 2,
        completed: 3, resourcepackstackfinished: 3,
      };
      const names = ["cancel", "downloading", "downloadingfinished", "resourcepackstackfinished"];
      let st = typeof data.responseStatus === "string"
        ? (map[data.responseStatus] ?? 2)
        : (data.responseStatus ?? 2);
      if (st > 3) st = 3;
      w.writeVarInt(st);
      w.writeString(names[st] ?? "downloadingfinished");
      if (st === 1) {
        const ids: string[] = data.resourcePackIds ?? [];
        w.writeVarInt(ids.length);
        for (const id of ids) w.writeString(id);
      }
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const responseStatus = r.readVarInt();
      const name = r.remaining ? r.readString() : "";
      return { responseStatus, name };
    },
  }, true);

  registerCodec(PacketId.Text, {
    encode(data) {
      // Protocol 2193 Text (gophertunnel/pmmp):
      // needsTranslation bool, category u8, type u8, [fields by type], xuid, platformChatId, optional filteredMessage
      const w = new BinaryWriter();
      const type = data.type ?? 1; // 1 = chat
      w.writeU8(data.needsTranslation ? 1 : 0);
      let category = 0;
      if (type === 1 || type === 7 || type === 8) category = 1; // chat/whisper/announcement
      else if (type === 2 || type === 3 || type === 4) category = 2; // translation/popup/jukebox
      w.writeU8(category);
      w.writeU8(type);
      if (type === 1 || type === 7 || type === 8) {
        w.writeString(data.sourceName ?? "");
        w.writeString(data.message ?? " ");
      } else if (type === 2 || type === 3 || type === 4) {
        w.writeString(data.message ?? " ");
        const params = data.parameters ?? [];
        w.writeVarInt(params.length);
        for (const p of params) w.writeString(p);
      } else {
        w.writeString(data.message ?? " ");
      }
      w.writeString(data.xuid ?? data.xboxUserId ?? "");
      w.writeString(data.platformChatId ?? "");
      if (data.filteredMessage != null && data.filteredMessage !== "") {
        w.writeU8(1);
        w.writeString(data.filteredMessage);
      } else {
        w.writeU8(0);
      }
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const needsTranslation = !!r.readU8();
      const category = r.readU8();
      const type = r.readU8();
      let sourceName = "";
      let message = "";
      const parameters: string[] = [];
      if (type === 1 || type === 7 || type === 8) {
        sourceName = r.readString();
        message = r.readString();
      } else if (type === 2 || type === 3 || type === 4) {
        message = r.readString();
        const n = r.readVarInt();
        for (let i = 0; i < n; i++) parameters.push(r.readString());
      } else {
        message = r.readString();
      }
      const xuid = r.remaining ? r.readString() : "";
      const platformChatId = r.remaining ? r.readString() : "";
      let filteredMessage: string | undefined;
      if (r.remaining && r.readU8()) filteredMessage = r.readString();
      return { type, needsTranslation, category, sourceName, message, parameters, xuid, platformChatId, filteredMessage };
    },
  }, true);

  registerCodec(PacketId.SetTime, varIntCodec("time"), true);

  registerCodec(PacketId.StartGame, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeZigZag64(BigInt(data.entityId ?? 1));
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 1));
      w.writeZigZag32(data.gamemode ?? 0);
      w.writeF32(data.spawn?.x ?? 0);
      w.writeF32(data.spawn?.y ?? 65);
      w.writeF32(data.spawn?.z ?? 0);
      w.writeF32(data.yaw ?? 0);
      w.writeF32(data.pitch ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      if (buf.length < 16) return { gamemode: 0, spawn: { x: 0, y: 65, z: 0 } };
      try {
        const entityId = Number(r.readZigZag64());
        const runtimeEntityId = Number(r.readVarLong());
        const gamemode = r.readZigZag32();
        const x = r.readF32(), y = r.readF32(), z = r.readF32();
        return {
          entityId, runtimeEntityId, gamemode,
          spawn: { x, y, z },
          yaw: r.remaining >= 4 ? r.readF32() : 0,
          pitch: r.remaining >= 4 ? r.readF32() : 0,
        };
      } catch {
        return { gamemode: 0, spawn: { x: 0, y: 65, z: 0 } };
      }
    },
  }, true);

  registerCodec(PacketId.MovePlayer, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 1));
      w.writeF32(data.position?.x ?? 0);
      w.writeF32(data.position?.y ?? 0);
      w.writeF32(data.position?.z ?? 0);
      w.writeF32(data.pitch ?? 0);
      w.writeF32(data.yaw ?? 0);
      w.writeF32(data.headYaw ?? data.yaw ?? 0);
      w.writeU8(data.mode ?? 0);
      w.writeU8(data.onGround ? 1 : 0);
      w.writeVarLong(BigInt(data.riddenRuntimeEntityId ?? 0));
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        runtimeEntityId: Number(r.readVarLong()),
        position: { x: r.readF32(), y: r.readF32(), z: r.readF32() },
        pitch: r.readF32(),
        yaw: r.readF32(),
        headYaw: r.readF32(),
        mode: r.readU8(),
        onGround: !!r.readU8(),
      };
    },
  }, true);

  registerCodec(PacketId.PlayerAuthInput, {
    encode(data) {
      // Exact gophertunnel master Marshal (protocol 1.26 / current):
      // Pitch, Yaw, Pos(xyz), Move(xz), HeadYaw,
      // InputFlagList (varuint32 count + varint32[] ids),
      // InputMode varuint32, PlayMode varuint32, InteractionModel varint32 (SIGNED),
      // InteractPitch/Yaw, Tick varuint64, Delta xyz,
      // 5x optional presence bools (item/stack/block/vehicleRot/predictedVehicle),
      // AnalogueMove xz, CameraOrientation xyz, RawMove xz
      const w = new BinaryWriter();
      w.writeF32(data.pitch ?? 0);
      w.writeF32(data.yaw ?? 0);
      w.writeF32(data.position?.x ?? 0);
      w.writeF32(data.position?.y ?? 0);
      w.writeF32(data.position?.z ?? 0);
      w.writeF32(data.moveVecX ?? 0);
      w.writeF32(data.moveVecZ ?? 0);
      w.writeF32(data.headYaw ?? data.yaw ?? 0);

      // InputFlagList — only set flag IDs (no PerformItem* flags)
      const bits = typeof data.inputData === "bigint"
        ? data.inputData
        : BigInt(data.inputData ?? 0);
      const flagIds: number[] = [];
      for (let i = 0; i < 66; i++) {
        if ((bits >> BigInt(i)) & 1n) flagIds.push(i);
      }
      w.writeVarInt(flagIds.length); // unsigned varint count
      for (const id of flagIds) w.writeZigZag32(id); // signed varint32 each

      w.writeVarInt(data.inputMode ?? 1); // Mouse
      w.writeVarInt(data.playMode ?? 0); // Normal
      w.writeZigZag32(data.interactionModel ?? 2); // Classic — SIGNED
      w.writeF32(data.interactPitch ?? data.pitch ?? 0);
      w.writeF32(data.interactYaw ?? data.yaw ?? 0);
      // Tick is Varuint64 in gophertunnel
      w.writeVarLong(BigInt(data.tick ?? 0));
      w.writeF32(data.delta?.x ?? 0);
      w.writeF32(data.delta?.y ?? 0);
      w.writeF32(data.delta?.z ?? 0);

      // Optional presence: all absent
      w.writeU8(0); // ItemInteractionData
      w.writeU8(0); // ItemStackRequest
      w.writeU8(0); // BlockActions
      w.writeU8(0); // VehicleRotation
      w.writeU8(0); // ClientPredictedVehicle

      // Always present trailing vectors
      w.writeF32(data.analogueMoveX ?? data.moveVecX ?? 0);
      w.writeF32(data.analogueMoveZ ?? data.moveVecZ ?? 0);
      const cam = data.cameraOrientation ?? { x: 0, y: 1, z: 0 };
      w.writeF32(cam.x ?? 0);
      w.writeF32(cam.y ?? 1);
      w.writeF32(cam.z ?? 0);
      w.writeF32(data.rawMoveX ?? data.moveVecX ?? 0);
      w.writeF32(data.rawMoveZ ?? data.moveVecZ ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const pitch = r.readF32(), yaw = r.readF32();
      const position = { x: r.readF32(), y: r.readF32(), z: r.readF32() };
      const moveVecX = r.readF32(), moveVecZ = r.readF32();
      const headYaw = r.readF32();
      const rest = buf.subarray(r.offsetPos);
      // InputFlagList is varuint32 count + zigzag32 flag ids (matches the encoder
      // above), NOT the old fixed-width continuation-bit bitset. Mixing the two
      // misaligned every field that followed (tick, delta, ...) — this was the V7
      // PlayerAuthInput roundtrip bug.
      const r2 = new BinaryReader(rest);
      const flagCount = r2.remaining ? r2.readVarInt() : 0;
      let inputData = 0n;
      for (let i = 0; i < flagCount; i++) {
        const id = r2.readZigZag32();
        inputData |= 1n << BigInt(id);
      }
      return {
        pitch, yaw, position, moveVecX, moveVecZ, headYaw,
        inputData,
        inputDataNum: Number(inputData & 0xffffffffn),
        inputMode: r2.remaining ? r2.readVarInt() : 1,
        playMode: r2.remaining ? r2.readVarInt() : 0,
        interactionModel: r2.remaining ? r2.readZigZag32() : 2,
        interactPitch: r2.remaining >= 4 ? r2.readF32() : pitch,
        interactYaw: r2.remaining >= 4 ? r2.readF32() : yaw,
        tick: r2.remaining ? Number(r2.readVarLong()) : 0,
        delta: r2.remaining >= 12
          ? { x: r2.readF32(), y: r2.readF32(), z: r2.readF32() }
          : { x: 0, y: 0, z: 0 },
      };
    },
  }, true);

  registerCodec(PacketId.SetLocalPlayerAsInitialized, varLongCodec("runtimeEntityId"), true);
  registerCodec(PacketId.RequestChunkRadius, {
    encode(data) {
      const w = new BinaryWriter();
      // PMMP 1.21+: signed varint radius + u8 maxRadius
      const r = data.chunkRadius ?? 8;
      w.writeZigZag32(r);
      w.writeU8(Math.min(255, data.maxRadius ?? Math.max(r, 12)));
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return { chunkRadius: r.readZigZag32(), maxRadius: r.remaining ? r.readU8() : 0 };
    },
  }, true);
  registerCodec(PacketId.ChunkRadiusUpdate, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeZigZag32(data.chunkRadius ?? 8);
      return w.toBuffer();
    },
    decode(buf) {
      return { chunkRadius: new BinaryReader(buf).readZigZag32() };
    },
  }, true);

  registerCodec(PacketId.SetHealth, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarInt(data.health ?? 20);
      return w.toBuffer();
    },
    decode(buf) {
      return { health: new BinaryReader(buf).readVarInt() };
    },
  }, true);

  registerCodec(PacketId.Animate, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeZigZag32(data.actionId ?? 1);
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 1));
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return { actionId: r.readZigZag32(), runtimeEntityId: Number(r.readVarLong()) };
    },
  }, true);

  registerCodec(PacketId.Interact, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeU8(data.actionId ?? 2);
      w.writeVarLong(BigInt(data.targetRuntimeEntityId ?? 0));
      if (data.position) {
        w.writeF32(data.position.x); w.writeF32(data.position.y); w.writeF32(data.position.z);
      }
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        actionId: r.readU8(),
        targetRuntimeEntityId: Number(r.readVarLong()),
      };
    },
  }, true);

  registerCodec(PacketId.PlayerAction, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 1));
      w.writeZigZag32(data.action ?? 0);
      w.writeZigZag32(data.position?.x ?? 0);
      w.writeZigZag32(data.position?.y ?? 0);
      w.writeZigZag32(data.position?.z ?? 0);
      w.writeZigZag32(data.resultPosition?.x ?? data.position?.x ?? 0);
      w.writeZigZag32(data.resultPosition?.y ?? data.position?.y ?? 0);
      w.writeZigZag32(data.resultPosition?.z ?? data.position?.z ?? 0);
      w.writeZigZag32(data.face ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        runtimeEntityId: Number(r.readVarLong()),
        action: r.readZigZag32(),
        position: { x: r.readZigZag32(), y: r.readZigZag32(), z: r.readZigZag32() },
      };
    },
  }, true);

  registerCodec(PacketId.MobEquipment, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 1));
      w.writeRaw(encodeNetworkItem(data.item));
      w.writeU8(data.slot ?? 0);
      w.writeU8(data.selectedSlot ?? 0);
      w.writeU8(data.windowId ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const runtimeEntityId = Number(r.readVarLong());
      const item = decodeNetworkItem(r);
      return {
        runtimeEntityId,
        item,
        slot: r.remaining ? r.readU8() : 0,
        selectedSlot: r.remaining ? r.readU8() : 0,
        windowId: r.remaining ? r.readU8() : 0,
      };
    },
  }, true);

  registerCodec(PacketId.InventoryContent, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarInt(data.windowId ?? 0);
      const items: any[] = data.items ?? data.slots ?? [];
      w.writeRaw(encodeItemList(items));
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const windowId = r.readVarInt();
      const items = decodeItemList(r);
      return { windowId, items };
    },
  }, true);

  registerCodec(PacketId.InventorySlot, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarInt(data.windowId ?? 0);
      w.writeVarInt(data.slot ?? 0);
      w.writeRaw(encodeNetworkItem(data.item));
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        windowId: r.readVarInt(),
        slot: r.readVarInt(),
        item: decodeNetworkItem(r),
      };
    },
  }, true);

  registerCodec(PacketId.PlayerHotbar, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarInt(data.selectedSlot ?? 0);
      w.writeU8(data.windowId ?? 0);
      w.writeU8(data.selectHotbarSlot === false ? 0 : 1);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        selectedSlot: r.readVarInt(),
        windowId: r.remaining ? r.readU8() : 0,
        selectHotbarSlot: r.remaining ? !!r.readU8() : true,
      };
    },
  }, true);

  registerCodec(PacketId.ContainerClose, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeU8(data.windowId ?? 0);
      w.writeU8(data.server ? 1 : 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return { windowId: r.readU8(), server: r.remaining ? !!r.readU8() : false };
    },
  }, true);

  registerCodec(PacketId.Respawn, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeF32(data.position?.x ?? 0);
      w.writeF32(data.position?.y ?? 0);
      w.writeF32(data.position?.z ?? 0);
      w.writeU8(data.state ?? 0);
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 1));
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        position: { x: r.readF32(), y: r.readF32(), z: r.readF32() },
        state: r.readU8(),
        runtimeEntityId: Number(r.readVarLong()),
      };
    },
  }, true);

  registerCodec(PacketId.CommandRequest, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeString(data.command ?? "");
      w.writeVarInt(0);
      w.writeU8(data.internal ? 1 : 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return { command: r.readString() };
    },
  }, true);

  registerCodec(PacketId.UpdateBlock, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeZigZag32(data.position?.x ?? 0);
      w.writeVarInt(data.position?.y ?? 0);
      w.writeZigZag32(data.position?.z ?? 0);
      w.writeVarInt(data.blockRuntimeId ?? 0);
      w.writeVarInt(data.flags ?? 0);
      w.writeVarInt(data.layer ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        position: { x: r.readZigZag32(), y: r.readVarInt(), z: r.readZigZag32() },
        blockRuntimeId: r.readVarInt(),
        flags: r.remaining ? r.readVarInt() : 0,
        layer: r.remaining ? r.readVarInt() : 0,
      };
    },
  }, true);

  registerCodec(PacketId.LevelChunk, {
    encode(data) {
      if (Buffer.isBuffer(data.raw) && data.skipWrap) return data.raw;
      return encodeLevelChunkBody({
        x: data.x ?? 0,
        z: data.z ?? 0,
        dimension: data.dimension ?? 0,
        subChunkCount: data.subChunkCount ?? 0,
        cacheEnabled: !!data.cacheEnabled,
        payload: data.payload,
        highestSubChunk: data.highestSubChunk,
      });
    },
    decode(buf) {
      try {
        return decodeLevelChunkBody(buf);
      } catch {
        return { raw: buf };
      }
    },
  }, true);

  registerCodec(PacketId.SubChunkRequest, {
    encode(data) {
      return encodeSubChunkRequest({
        dimension: data.dimension ?? 0,
        origin: data.origin ?? data.position ?? { x: 0, y: 0, z: 0 },
        offsets: data.offsets ?? [],
      });
    },
    decode(buf) {
      return decodeSubChunkRequest(buf);
    },
  }, true);

  registerCodec(PacketId.SubChunk, {
    encode(data) {
      return encodeSubChunkPacket({
        cacheEnabled: !!data.cacheEnabled,
        dimension: data.dimension ?? 0,
        origin: data.origin ?? data.position ?? { x: 0, y: 0, z: 0 },
        entries: data.entries ?? [],
      });
    },
    decode(buf) {
      return decodeSubChunkPacket(buf);
    },
  }, true);

  registerCodec(PacketId.ClientCacheStatus, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeBool(!!data.enabled);
      return w.toBuffer();
    },
    decode(buf) {
      return { enabled: buf.length ? new BinaryReader(buf).readBool() : false };
    },
  }, true);

  registerCodec(PacketId.NetworkChunkPublisherUpdate, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeZigZag32(data.position?.x ?? 0);
      w.writeVarInt(data.position?.y ?? 0);
      w.writeZigZag32(data.position?.z ?? 0);
      w.writeU32(data.radius ?? 0);
      const saved = data.savedChunks ?? [];
      w.writeVarInt(saved.length);
      for (const c of saved) {
        w.writeZigZag32(c.x ?? 0);
        w.writeZigZag32(c.z ?? 0);
      }
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      const position = {
        x: r.readZigZag32(),
        y: r.readVarInt(),
        z: r.readZigZag32(),
      };
      const radius = r.remaining >= 4 ? r.readU32() : 0;
      const n = r.remaining ? r.readVarInt() : 0;
      const savedChunks: Array<{ x: number; z: number }> = [];
      for (let i = 0; i < n && r.remaining > 0; i++) {
        savedChunks.push({ x: r.readZigZag32(), z: r.readZigZag32() });
      }
      return { position, radius, savedChunks };
    },
  }, true);

  registerCodec(PacketId.RemoveEntity, varLongCodec("entityId"), true);
  registerCodec(PacketId.SetEntityMotion, {
    encode(data) {
      const w = new BinaryWriter();
      w.writeVarLong(BigInt(data.runtimeEntityId ?? 0));
      w.writeF32(data.velocity?.x ?? 0);
      w.writeF32(data.velocity?.y ?? 0);
      w.writeF32(data.velocity?.z ?? 0);
      return w.toBuffer();
    },
    decode(buf) {
      const r = new BinaryReader(buf);
      return {
        runtimeEntityId: Number(r.readVarLong()),
        velocity: { x: r.readF32(), y: r.readF32(), z: r.readF32() },
      };
    },
  }, true);
}

registerAll();

export function encodeBatch(packets: Buffer[]): Buffer {
  const parts: Buffer[] = [];
  for (const p of packets) {
    const lw = new BinaryWriter();
    lw.writeVarInt(p.length);
    parts.push(lw.toBuffer(), p);
  }
  return Buffer.concat(parts);
}

export function decodeBatch(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const r = new BinaryReader(buf);
  while (r.remaining > 0) {
    try {
      const len = r.readVarInt();
      if (len <= 0 || len > r.remaining) break;
      out.push(r.readBuffer(len));
    } catch { break; }
  }
  return out;
}

export function getRegisteredCodecIds(): number[] {
  return [...codecs.keys()];
}

export function getCodecCoverage(): { total: number; specialized: number } {
  return { total: codecs.size, specialized: specialized.size };
}
