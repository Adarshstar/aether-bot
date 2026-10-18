/**
 * Bedrock JWT chain / multiplayer token builder
 * ES384 client keypair + offline chain + online hook
 *
 * Online: attach Mojang chain from Minecraft services after Xbox auth
 * Offline / 1.26+: self-signed multiplayer token (TokenPayload style)
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, createHash, randomUUID } from "crypto";

/** Mojang ES384 public key (x5u / identityPublicKey in online client identity JWT) */
export const MOJANG_BEDROCK_PUBLIC_KEY =
  "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAECRXueJeTDqNRRgJi/vlRufByu/2G0i2Ebt6YMar5QX/R0DIIyrJMcUpruK4QveTfJSTp3Shlq4Gk34cD/4GUWwkv0DVuzeuB+tXija7HBxii03NHDbPAD0AKnLr2wdAp";

export interface KeyPairMaterial {
  privateKeyPem: string;
  publicKeyPem: string;
  /** X509 SPKI base64 (for identityPublicKey / cpk) */
  x509: string;
}

export interface ChainResult {
  chain: string[];
  /** 1.26.10+ style single multiplayer token */
  multiplayerToken: string;
  keyPair: KeyPairMaterial;
  uuid: string;
  xuid: string;
  displayName: string;
}

function b64url(data: Buffer | string): string {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJwt(header: object, payload: object, privateKeyPem: string): string {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = sign("SHA384", Buffer.from(data), {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${b64url(sig)}`;
}

/** Generate ES384 (P-384) keypair for Bedrock login */
export function generateBedrockKeyPair(): KeyPairMaterial {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  // Bedrock often uses base64 of DER SPKI
  const x509 = spki.toString("base64");
  return { privateKeyPem, publicKeyPem, x509 };
}

function offlineUuid(username: string): string {
  // deterministic offline UUID (version 3 style from name)
  const hash = createHash("md5").update("OfflinePlayer:" + username).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Build offline Bedrock auth material
 * - Legacy: 1-element self-signed chain
 * - Modern: multiplayerToken with cpk / xname / xid
 */
export function buildOfflineChain(username: string, keyPair?: KeyPairMaterial): ChainResult {
  const kp = keyPair ?? generateBedrockKeyPair();
  const uuid = offlineUuid(username);
  const xuid = "0";
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "ES384",
    x5u: kp.x509,
  };

  const payload = {
    nbf: now - 10,
    exp: now + 60 * 60 * 24,
    iat: now,
    iss: "self",
    certificateAuthority: true,
    identityPublicKey: kp.x509,
    extraData: {
      displayName: username,
      identity: uuid,
      XUID: xuid,
      titleId: "89692877",
    },
  };

  const localChain = encodeJwt(header, payload, kp.privateKeyPem);

  // 1.26.10+ multiplayer / GameServerToken-style claims
  // NetherNet structural validation expects xid, mid (PlayFab/UUID), xname, cpk
  const mpPayload = {
    cpk: kp.x509,
    xid: xuid,
    mid: uuid,
    xname: username,
    nbf: now - 10,
    exp: now + 60 * 60 * 24,
    iat: now,
  };
  const multiplayerToken = encodeJwt(header, mpPayload, kp.privateKeyPem);

  return {
    chain: [localChain],
    multiplayerToken,
    keyPair: kp,
    uuid,
    xuid,
    displayName: username,
  };
}

/**
 * Merge Mojang-provided chain with local client JWT (online mode)
 * mojangChain: JWTs from Minecraft services
 */
export function buildOnlineChain(
  username: string,
  mojangChain: string[],
  keyPair?: KeyPairMaterial,
  xuid = "0",
  uuid?: string
): ChainResult {
  const kp = keyPair ?? generateBedrockKeyPair();
  const id = uuid ?? randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES384", x5u: kp.x509 };

  // Online client identity JWT (Prismarine login.js):
  //   payload: { identityPublicKey: <Mojang pubkey>, certificateAuthority: true }
  //   header.x5u: client public key
  // Identity/XUID come from Mojang chain JWTs, not this token.
  const clientPayload = {
    identityPublicKey: MOJANG_BEDROCK_PUBLIC_KEY,
    certificateAuthority: true,
  };
  const local = encodeJwt(header, clientPayload, kp.privateKeyPem);
  const filtered = mojangChain.filter(Boolean);
  const chain = filtered.length ? [local, ...filtered] : [local];

  const multiplayerToken = encodeJwt(header, {
    cpk: kp.x509,
    xid: String(xuid),
    mid: id,
    xname: username,
    nbf: now - 10,
    exp: now + 86400,
    iat: now,
  }, kp.privateKeyPem);

  return { chain, multiplayerToken, keyPair: kp, uuid: id, xuid: String(xuid), displayName: username };
}
