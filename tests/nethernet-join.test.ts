import { describe, test, expect } from "bun:test";
import { createServer } from "node:http";
import { NetherNetTransport } from "../src/transport/nethernet";
import { createMockPeerConnection, MOCK_ANSWER_SDP, injectSdpIdentity } from "../index";

describe("WebRTC join over mock peer + HTTP signaling", () => {
  test("POST /v1/join/{id} completes datachannel open", async () => {
    const answer = injectSdpIdentity(MOCK_ANSWER_SDP, "server.jwt.sig");
    let posted = false;
    const server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/v1/join") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ networkId: "99", protocol: 2193, version: "1.26.52" }));
        return;
      }
      if (req.method === "POST" && req.url?.startsWith("/v1/join/")) {
        posted = true;
        let raw = "";
        req.on("data", (c) => { raw += c; });
        req.on("end", () => {
          // Real NetherNet HTTP signaling (Partner Onboarding Guide): the POST body is
          // the raw SDP offer text (Content-Type: application/sdp), not a JSON wrapper.
          expect(raw.startsWith("v=")).toBe(true);
          expect(raw).toContain("a=identity:");
          res.writeHead(200, { "content-type": "application/sdp" });
          res.end(answer);
        });
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const t = new NetherNetTransport({
      host: "127.0.0.1",
      port,
      strictWebRTC: true,
      createPeerConnection: createMockPeerConnection,
      identityAssertion: "client.jwt.sig",
      requireServerIdentity: true,
      signalingTimeoutMs: 4000,
    });
    await t.connect();
    expect(t.isConnected).toBe(true);
    expect(t.isLoopback).toBe(false);
    expect(posted).toBe(true);
    await t.disconnect();
    await new Promise<void>((r) => server.close(() => r()));
  });
});
