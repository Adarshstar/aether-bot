/**
 * NetherNet SDP helpers — fingerprint + a=identity assertion
 *
 * Format (from Mojang NetherNet + PrismarineJS/node-nethernet + df-mc/go-nethernet):
 *   a=identity:<base64(JSON {
 *     assertion: JSON.stringify({ fingerprints: <detached ES384 JWS>, token: <mpToken> }),
 *     idp: { domain: string, protocol: "default" }
 *   })>
 *
 * fingerprints JWS signs canonical JSON: {"fingerprint":[{"algorithm":"sha-256","digest":"..."},...]}
 * with the same P-384 private key whose public key is the multiplayer token's `cpk` claim.
 * Detached compact JWS: header..signature (empty payload segment).
 *
 * Missing/invalid identity → CONNECTERROR 37 ErrorCodeIdentityNotAllowed.
 */

import { createPrivateKey, sign, type KeyObject } from "crypto";

function b64url(data: Buffer | string): string {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export interface SdpIdentityInfo {
  identity: string | null;
  fingerprints: string[];
  iceUfrag?: string;
  icePwd?: string;
}

export interface FingerprintEntry {
  algorithm: string;
  digest: string;
}

/** Parse a=identity, a=fingerprint, ice-ufrag/pwd from SDP. */
export function parseSdpIdentity(sdp: string): SdpIdentityInfo {
  const identity = /(?:^|\r?\n)a=identity:([^\r\n]+)/.exec(sdp)?.[1]?.trim() ?? null;
  const fingerprints = [...sdp.matchAll(/(?:^|\r?\n)a=fingerprint:([^\r\n]+)/g)].map((m) => m[1].trim());
  const iceUfrag = /(?:^|\r?\n)a=ice-ufrag:([^\r\n]+)/.exec(sdp)?.[1]?.trim();
  const icePwd = /(?:^|\r?\n)a=ice-pwd:([^\r\n]+)/.exec(sdp)?.[1]?.trim();
  return { identity, fingerprints, iceUfrag, icePwd };
}

/** Extract structured fingerprint entries (order preserved). */
export function extractFingerprints(sdp: string): FingerprintEntry[] {
  const out: FingerprintEntry[] = [];
  for (const line of String(sdp).split(/\r?\n/)) {
    const m = line.match(/^a=fingerprint:(\S+)\s+(\S+)/);
    if (m) out.push({ algorithm: m[1], digest: m[2] });
  }
  return out;
}

/** Canonical JSON payload the fingerprints JWS signs (no spaces). */
export function fingerprintsPayload(fps: FingerprintEntry[]): string {
  return JSON.stringify({ fingerprint: fps });
}

/**
 * Detached compact ES384 JWS over `payloadBytes`.
 * Form: header..signature (empty payload segment).
 */
export function detachedES384(payloadBytes: Buffer, privateKey: KeyObject | string): string {
  const key =
    typeof privateKey === "string" || Buffer.isBuffer(privateKey)
      ? createPrivateKey(privateKey)
      : privateKey;
  const details = key.asymmetricKeyDetails as { namedCurve?: string } | undefined;
  if (key.type !== "private" || key.asymmetricKeyType !== "ec" || details?.namedCurve !== "secp384r1") {
    throw new TypeError("NetherNet identity requires an EC P-384 (secp384r1) private key");
  }
  const header = b64url(JSON.stringify({ alg: "ES384" }));
  const signingInput = `${header}.${b64url(payloadBytes)}`;
  const sig = sign("SHA384", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}..${b64url(sig)}`;
}

/**
 * Build the a=identity attribute VALUE (base64) for an offer SDP.
 * identity: { privateKeyPem | privateKey, token (multiplayer JWT), domain? }
 */
export function buildIdentityAttribute(
  sdp: string,
  identity: { privateKeyPem?: string; privateKey?: KeyObject | string; token: string; domain?: string }
): string {
  const fps = extractFingerprints(sdp);
  if (!fps.length) throw new Error("NetherNet identity: no a=fingerprint in offer SDP");

  const keyMaterial = identity.privateKey ?? identity.privateKeyPem;
  if (!keyMaterial) throw new Error("NetherNet identity: missing privateKey / privateKeyPem");

  const fingerprintsJws = detachedES384(Buffer.from(fingerprintsPayload(fps)), keyMaterial as any);
  const assertion = JSON.stringify({ fingerprints: fingerprintsJws, token: identity.token });
  const identityData = {
    assertion,
    idp: { domain: identity.domain ?? "", protocol: "default" },
  };
  return Buffer.from(JSON.stringify(identityData)).toString("base64");
}

/** Insert or replace session-level a=identity line (before first m=). */
export function injectSdpIdentity(sdp: string, assertionValue: string): string {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r?\n/).filter((l) => !l.startsWith("a=identity:"));
  const mi = lines.findIndex((l) => l.startsWith("m="));
  const idLine = `a=identity:${assertionValue}`;
  if (mi === -1) lines.push(idLine);
  else lines.splice(mi, 0, idLine);
  return lines.join(eol);
}

/**
 * Full pipeline: extract fingerprints → detached JWS → base64 envelope → inject a=identity.
 */
export function applyIdentityToOffer(
  sdp: string,
  opts: { privateKeyPem: string; token: string; domain?: string }
): string {
  const value = buildIdentityAttribute(sdp, opts);
  return injectSdpIdentity(sdp, value);
}

/** @deprecated Prefer buildIdentityAttribute + injectSdpIdentity. Kept for tests. */
export function signIdentityAssertion(opts: {
  privateKeyPem: string;
  token: string;
  fingerprints: string[];
  domain?: string;
}): string {
  // Rebuild structured fps from "alg digest" strings if possible
  const fps: FingerprintEntry[] = opts.fingerprints.map((f) => {
    const parts = f.trim().split(/\s+/);
    return { algorithm: parts[0] ?? "sha-256", digest: parts[1] ?? parts[0] ?? "" };
  });
  const fingerprintsJws = detachedES384(
    Buffer.from(fingerprintsPayload(fps)),
    opts.privateKeyPem
  );
  const assertion = JSON.stringify({ fingerprints: fingerprintsJws, token: opts.token });
  const identityData = {
    assertion,
    idp: { domain: opts.domain ?? "", protocol: "default" },
  };
  return Buffer.from(JSON.stringify(identityData)).toString("base64");
}

/** Decode the outer base64 identity envelope (not the inner JWS). */
export function decodeIdentityEnvelope(
  assertionValue: string
): { assertion?: string; idp?: { domain?: string; protocol?: string } } | null {
  try {
    const json = Buffer.from(assertionValue, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Best-effort decode of legacy JWT-style assertions (for tests). */
export function decodeIdentityJwt(assertion: string): Record<string, unknown> | null {
  const parts = assertion.split(".");
  if (parts.length >= 2) {
    try {
      const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      );
      return JSON.parse(json);
    } catch {
      /* fall through */
    }
  }
  return decodeIdentityEnvelope(assertion) as Record<string, unknown> | null;
}
