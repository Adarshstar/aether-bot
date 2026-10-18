import { describe, test, expect } from "bun:test";
import { extractSdp } from "../src/transport/nethernet";
import { createServer } from "node:http";
import { NetherNetTransport } from "../src/transport/nethernet";

describe("SDP answer shapes", () => {
  test("flat {sdp,type}", () => {
    const p = extractSdp({ sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1", type: "answer" });
    expect(p?.type).toBe("answer");
    expect(p?.sdp.startsWith("v=0")).toBe(true);
  });
  test("nested answer.sdp", () => {
    const p = extractSdp({ answer: { sdp: "v=0\r\n", type: "answer" } });
    expect(p?.sdp.startsWith("v=0")).toBe(true);
  });
  test("raw SDP string", () => {
    const p = extractSdp("v=0\r\no=- 0 0 IN IP4 0.0.0.0");
    expect(p?.sdp.startsWith("v=0")).toBe(true);
  });
});

describe("HTTP /v1/join probe", () => {
  test("parses BDS-style JSON", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/v1/join") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          name: "AetherWorld",
          protocol: 2193,
          version: "1.26.52",
          level: "Bedrock level",
          players: 0,
          maxPlayers: 10,
          gameType: 0,
          networkId: "4242",
        }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const t = new NetherNetTransport({ host: "127.0.0.1", port, strictWebRTC: false });
    const info = await t.probe();
    expect(info.protocol).toBe(2193);
    expect(info.networkId).toBe("4242");
    expect(info.version).toContain("1.26");
    await t.disconnect();
    await new Promise<void>((r) => server.close(() => r()));
  });
});
