import { describe, test, expect } from "bun:test";
import {
  parseSdpIdentity,
  injectSdpIdentity,
  applyIdentityToOffer,
  decodeIdentityEnvelope,
  extractFingerprints,
  generateBedrockKeyPair,
  buildOfflineChain,
  MOCK_OFFER_SDP,
  MOCK_ANSWER_SDP,
} from "../index";

describe("SDP identity", () => {
  test("parse fingerprints from mock offer", () => {
    const info = parseSdpIdentity(MOCK_OFFER_SDP);
    expect(info.identity).toBeNull();
    expect(info.fingerprints.length).toBe(1);
    expect(info.fingerprints[0].startsWith("sha-256")).toBe(true);
    expect(info.iceUfrag).toBe("aeth");
  });

  test("extract structured fingerprints", () => {
    const fps = extractFingerprints(MOCK_OFFER_SDP);
    expect(fps.length).toBe(1);
    expect(fps[0].algorithm).toBe("sha-256");
    expect(fps[0].digest.length).toBeGreaterThan(10);
  });

  test("inject then parse a=identity", () => {
    const sdp = injectSdpIdentity(MOCK_OFFER_SDP, "header.payload.sig");
    const info = parseSdpIdentity(sdp);
    expect(info.identity).toBe("header.payload.sig");
    expect(sdp).toContain("a=fingerprint:");
    // identity line placed before first m=
    const idIdx = sdp.indexOf("a=identity:");
    const mIdx = sdp.indexOf("m=");
    expect(idIdx).toBeGreaterThan(-1);
    expect(mIdx).toBeGreaterThan(idIdx);
  });

  test("sign NetherNet identity envelope (detached ES384 + base64)", () => {
    const kp = generateBedrockKeyPair();
    const chain = buildOfflineChain("Aether", kp);
    const sdp = applyIdentityToOffer(MOCK_OFFER_SDP, {
      privateKeyPem: kp.privateKeyPem,
      token: chain.multiplayerToken,
      domain: "aether.test",
    });
    const info = parseSdpIdentity(sdp);
    expect(info.identity).toBeTruthy();
    // Outer value is base64 of { assertion, idp }
    const env = decodeIdentityEnvelope(info.identity!);
    expect(env).toBeTruthy();
    expect(env!.idp?.domain).toBe("aether.test");
    expect(env!.idp?.protocol).toBe("default");
    expect(typeof env!.assertion).toBe("string");
    const inner = JSON.parse(env!.assertion!);
    expect(inner.token).toBe(chain.multiplayerToken);
    // fingerprints is detached ES384 JWS: header..signature
    expect(inner.fingerprints.split(".").length).toBe(3);
    expect(inner.fingerprints.includes("..")).toBe(true);
  });

  test("answer without identity is detectable", () => {
    expect(parseSdpIdentity(MOCK_ANSWER_SDP).identity).toBeNull();
  });
});
