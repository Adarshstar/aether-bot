# Minimal live-join checklist — BDS 1.26.52.3

Use this to verify Aether can join a **real** Bedrock Dedicated Server over NetherNet.

## Automated validation

```bash
# Probe + mock WebRTC contract (no BDS required for mock step)
bun run validate:join

# Live attempt against running BDS
MC_HOST=127.0.0.1 MC_PORT=19132 STRICT_WEBRTC=1 bun run validate:join
# requires: bun add werift
```

## Prerequisites

- [ ] Official **BDS 1.26.52.3** downloaded and extracted  
  (or matching protocol **2193**)
- [ ] Node 20+ or **Bun** ≥ 1.0
- [ ] Aether repo cloned (`Adarshstar/aether`)
- [ ] For live WebRTC: `bun add werift` (or `wrtc`)

## Server setup

1. Edit `server.properties`:
   - `online-mode=false` for offline bots (simplest)
   - Or `online-mode=true` and use Microsoft auth in the client
   - Default port `19132`
   - Leave transport as NetherNet (default on 1.26.5x)
2. Allow firewall UDP/TCP for the game port if needed.
3. Start BDS and confirm console shows server started.

## Client checklist

### A. Offline + loopback (dev only — not a real player on BDS)

```bash
bun run examples/basic.ts
# or
MC_HOST=127.0.0.1 MC_PORT=19132 bun run examples/ai-bot.ts
```

- [ ] Process starts without crash  
- [ ] Logs may show `Development loopback` if no RTCPeerConnection  
- [ ] **This does not prove live join**

### B. Live WebRTC join (real path)

```bash
bun add werift
```

```ts
import { RTCPeerConnection } from "werift";
import {
  createBot,
  createWeriftPeerConnectionFactory,
  AETHER_VERSION,
} from "aether-bot"; // or relative index

console.log("Aether", AETHER_VERSION);

const bot = createBot({
  host: "127.0.0.1",
  port: 19132,
  username: "AetherLive",
  offline: true,
  strictWebRTC: true,
  createPeerConnection: createWeriftPeerConnectionFactory(RTCPeerConnection),
  autoReconnect: true,
  maxRetries: 4,
  iceGatherTimeoutMs: 6000,
  signalingTimeoutMs: 15000,
});

bot.on("login", () => console.log("✓ login"));
bot.on("spawn", () => {
  console.log("✓ spawn — live session");
  bot.chat("Aether live join OK");
});
bot.on("disconnect", (r) => console.log("disconnect", r));
bot.on("error", console.error);

await bot.connect();
```

### Success criteria (live)

- [ ] Log: `GET http://host:port/v1/join` → Probe OK  
- [ ] Log: `POST .../v1/join/{networkId}` succeeds (HTTP 200)  
- [ ] Log: `WebRTC data channel OPEN — live path` (not loopback)  
- [ ] `login` then `spawn` events fire  
- [ ] Bot appears in BDS player list / `list` command  
- [ ] Chat from bot visible on server  

### Failure points

| Symptom | Likely cause |
|---------|----------------|
| Probe HTTP failed | BDS not running / wrong host:port / firewall |
| DataChannel open timeout | ICE/NAT; try host on same LAN; check STUN |
| Missing `a=identity` | Set `requireServerIdentity: false` for testing, or fix identity JWT |
| Stuck after Login | Pack/stack handling or StartGame decode — capture packets |
| Loopback despite `strictWebRTC` | `createPeerConnection` not injected |

### Eating on live session

After spawn, with food in inventory:

```ts
bot.autoEat.enable(14);
// or
await bot.eat(true);
// or
bot.activateItem(); // held item
```

Expect server-side hunger increase when UseItem + ReleaseItem are accepted.

## AI with API key (after live or loopback spawn)

```bash
AI_API_KEY=sk-... \
MC_HOST=127.0.0.1 MC_PORT=19132 \
bun run examples/ai-bot.ts
```

Optional: `AI_BASE_URL`, `AI_MODEL` for non-OpenAI endpoints.

## Report template

When filing issues, include:

1. BDS exact version string  
2. `online-mode` true/false  
3. Whether log shows **loopback** or **data channel OPEN**  
4. Last 30 lines of client log  
5. BDS console lines around the join  
