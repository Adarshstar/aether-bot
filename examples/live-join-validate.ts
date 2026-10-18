/**
 * Live BDS + WebRTC validation harness
 *
 * Modes:
 *   1) Probe only (no WebRTC): checks GET /v1/join
 *   2) Mock WebRTC (always): ensures signaling contract
 *   3) Live WebRTC: set STRICT_WEBRTC=1 and inject werift
 *
 * Usage:
 *   bun run examples/live-join-validate.ts
 *   MC_HOST=127.0.0.1 MC_PORT=19132 bun run examples/live-join-validate.ts
 *   STRICT_WEBRTC=1 bun run examples/live-join-validate.ts   # needs: bun add werift
 */

import {
  NetherNetTransport,
  createMockPeerConnection,
  resolvePeerConnectionFactory,
  AETHER_VERSION,
  AETHER_NAME,
  TARGET_PROTOCOL,
} from "../index";

const host = process.env.MC_HOST ?? "127.0.0.1";
const port = Number(process.env.MC_PORT ?? 19132);
const strict = process.env.STRICT_WEBRTC === "1" || process.env.STRICT_WEBRTC === "true";

type Result = { step: string; ok: boolean; detail?: string };

const results: Result[] = [];

function pass(step: string, detail?: string) {
  results.push({ step, ok: true, detail });
  console.log(`  ✓ ${step}${detail ? " — " + detail : ""}`);
}
function fail(step: string, detail?: string) {
  results.push({ step, ok: false, detail });
  console.log(`  ✗ ${step}${detail ? " — " + detail : ""}`);
}

console.log(`${AETHER_NAME} ${AETHER_VERSION} — live-join validation`);
console.log(`Target ${host}:${port} protocol=${TARGET_PROTOCOL} strictWebRTC=${strict}`);
console.log("");

// ── 1. HTTP probe ──
console.log("[1] Probe GET /v1/join");
try {
  const url = `http://${host}:${port}/v1/join`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": `Aether/${AETHER_VERSION}` },
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  if (!res.ok) {
    fail("probe", `HTTP ${res.status}`);
  } else {
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* */
    }
    pass(
      "probe",
      json
        ? `networkId=${json.networkId ?? json.id ?? "?"} protocol=${json.protocol ?? "?"}`
        : text.slice(0, 80)
    );
  }
} catch (e: any) {
  fail("probe", e?.message ?? String(e));
  console.log("    (BDS may be offline — continuing with mock path)");
}

// ── 2. Mock WebRTC signaling contract ──
console.log("\n[2] Mock WebRTC join contract");
try {
  const { createServer } = await import("node:http");
  const answerSdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=identity:server.test\r\n";
  let posted = false;
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/join") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ networkId: "42", protocol: TARGET_PROTOCOL, version: "1.26.52.3" }));
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/v1/join/")) {
      posted = true;
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ sdp: answerSdp, type: "answer" }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const mockPort = typeof addr === "object" && addr ? addr.port : 0;

  const t = new NetherNetTransport({
    host: "127.0.0.1",
    port: mockPort,
    strictWebRTC: true,
    createPeerConnection: createMockPeerConnection,
    identityAssertion: "client.test",
    signalingTimeoutMs: 5000,
  });
  await t.connect();
  if (t.isConnected && !t.isLoopback && posted) {
    pass("mock_webrtc", "datachannel open, not loopback");
  } else {
    fail("mock_webrtc", `connected=${t.isConnected} loopback=${t.isLoopback} posted=${posted}`);
  }
  await t.disconnect();
  await new Promise<void>((r) => server.close(() => r()));
} catch (e: any) {
  fail("mock_webrtc", e?.message ?? String(e));
}

// ── 3. Live WebRTC (optional) ──
console.log("\n[3] Live WebRTC to target host");
if (!strict) {
  console.log("  · skipped (set STRICT_WEBRTC=1 to attempt live join with werift)");
  results.push({ step: "live_webrtc", ok: true, detail: "skipped" });
} else {
  try {
    let factory: (() => any) | undefined;
    factory = await resolvePeerConnectionFactory() ?? undefined;
    if (factory) pass("webrtc_load", "factory available");
    else {
      fail("webrtc_load", "bun add werift");
      throw new Error("no WebRTC");
    }

    const t = new NetherNetTransport({
      host,
      port,
      strictWebRTC: true,
      createPeerConnection: factory,
      signalingTimeoutMs: 15000,
      iceGatherTimeoutMs: 6000,
      maxRetries: 2,
    });
    await t.connect();
    if (t.isConnected && !t.isLoopback) {
      pass("live_webrtc", "LIVE datachannel open");
    } else if (t.isLoopback) {
      fail("live_webrtc", "fell back to loopback");
    } else {
      fail("live_webrtc", "not connected");
    }
    await t.disconnect();
  } catch (e: any) {
    fail("live_webrtc", e?.message ?? String(e));
  }
}

// ── Summary ──
console.log("\n══ Summary ══");
const failed = results.filter((r) => !r.ok);
const critical = failed.filter((r) => r.step !== "probe"); // probe may fail without BDS
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}${r.detail ? "  (" + r.detail + ")" : ""}`);
}
if (critical.length) {
  console.log(`\n${critical.length} critical failure(s). See docs/LIVE_JOIN.md`);
  process.exit(1);
}
if (failed.length) {
  console.log(`\nNon-critical: ${failed.map(f=>f.step).join(", ")} (OK for CI without BDS)`);
}
console.log("\nValidation OK (mock path).");
