# Aether Engine — Full Handoff Document for Next AI Agent

**Read this entire document before changing code.**  
You are continuing development of **Aether**, a from-scratch Minecraft **Bedrock** AI bot client engine. It is **not** a Mineflayer fork.

---

## 1. Identity

| Field | Value |
|-------|--------|
| **Name** | Aether |
| **npm name** | `aether-bot` |
| **Version** | **1.4.0-alpha** |
| **Target** | Bedrock Dedicated Server **1.26.52.3** |
| **Protocol** | **2193** |
| **Transport** | **NetherNet** (WebRTC + HTTP signaling). RakNet deprecated/removed on modern BDS. |
| **Language** | TypeScript, run with **Bun** |
| **License** | MIT |
| **Root path** | `bedrock-ai-engine/` (zip may be named `aether-bot.zip`) |

**Mission:** High-level bot API + pathfinding + AI agent (ChatGPT/OpenAI-compatible) that can eventually **play** on real BDS over NetherNet.

---

## 2. What Aether is / is not

### Is
- TypeScript Bedrock-oriented bot **engine**
- Inspired by Mineflayer **ideas** (events, dig/place, path goals, plugins) but **rewritten** for Bedrock
- Core APIs on `Bot` (not 43 inject-only plugins)
- LLM planner via API key + chat completions URL
- NetherNet signaling client + `BDSSession` login/gameplay pipeline

### Is not
- A Java Edition client (Mineflayer is Java-only)
- Production-ready for public servers without WebRTC + live BDS validation
- A copy of PrismarineJS source

---

## 3. Repository layout

```
bedrock-ai-engine/
├── package.json              # aether-bot 1.4.0-alpha
├── index.ts                  # public exports
├── README.md
├── HANDOFF.md                # this file
├── tsconfig.json
├── examples/
├── tests/                    # bun test — must stay green
└── src/
    ├── core/ Bot.ts, createBot.ts, PluginLoader.ts, version.ts
    ├── protocol/
    │   ├── packets.ts, binary.ts, codec.ts
    │   ├── ProtocolClient.ts, ProtocolHandler.ts, BDSSession.ts
    │   ├── framing.ts, snappy.ts, authInput.ts, itemStack.ts
    │   ├── subchunk.ts        # SubChunkRequest 0xAF + SubChunk 0xAE
    │   └── sdp.ts             # a=identity parse / ES384 sign
    ├── transport/
    │   ├── nethernet.ts, Transport.ts, mockRtc.ts
    ├── auth/ XboxAuth.ts, JwtChain.ts
    ├── world/ Chunk.ts, World.ts, levelChunk.ts
    ├── pathfinding/, goals/, registry/, physics/, ai/
    └── inventory, combat, pvp, autoeat, collect, tool, …
```

---

## 4. How to run

```bash
cd bedrock-ai-engine
bun test      # MUST pass before handoff completes any task
bun run examples/full-agent.ts
AI_API_KEY=sk-... bun run examples/ai-bot.ts
```

---

## 5. Architecture (current)

### Connect path
1. `XboxAuth.authenticate()` → offline ES384 JWT chain **or** MSA device code online  
2. `NetherNetTransport.connect()`  
   - `GET http://host:port/v1/join`  
   - `RTCPeerConnection` + data channels `ReliableDataChannel` / `UnreliableDataChannel`  
   - Offer SDP may carry `a=identity` (ES384 JWT bound to DTLS fingerprints + multiplayer token)  
   - `POST /v1/join/{networkId}` with SDP (flat `sdp` + nested `offer`)  
   - If no WebRTC: **loopback** fallback (dev only)  
3. `BDSSession.startLogin()`  
   - RequestNetworkSettings → NetworkSettings → **ClientCacheStatus** → Login → packs → StartGame → spawn  
   - LevelChunk request mode (`0xFFFFFFFF` / `0xFFFFFFFE`) → **SubChunkRequest** for the column  
   - Starts **PlayerAuthInput** interval 50ms  
4. Bot emits `login` / `spawn`; physics + AI can run  

### AI path
- `createAIBot({ aiApiKey, aiBaseUrl, aiModel })`  
- Planner asks Chat Completions API for JSON actions  
- Agent executes: chat, move_to, attack, wait, control, …

### Design choices vs Mineflayer
- Hot APIs **on Bot** (dig, place, goTo, …) for speed/types  
- Plugins optional  
- Bedrock packets + NetherNet, not Java TCP/`minecraft-protocol`  

---

## 6. Status matrix (honest)

| Feature | Status |
|---------|--------|
| TypeScript bot API | Solid |
| Pathfinder + goals + follower | Solid (local world) |
| Registries (block/entity/item) | Seeded (1.21+ names), extensible via loadJSON |
| Binary codec registry | All PacketIds registered; login/move/chunk/subchunk/inventory specialized |
| JWT offline chain ES384 | Working |
| Online MSA→XBL→XSTS | Implemented; depends on live services |
| NetherNet signaling | GET/POST `/v1/join` + multiple SDP body shapes |
| Data channels | `ReliableDataChannel` / `UnreliableDataChannel` |
| Fragment header + deflate + **Snappy** | Implemented (unframed Snappy 0x01) |
| SDP `a=identity` | Parse + ES384 sign offer; optional `requireServerIdentity` |
| Mock WebRTC join test | HTTP `/v1/join` + mock PC opens datachannel |
| Live WebRTC to BDS | Needs RTCPeerConnection (werift/wrtc) + reachable server |
| LevelChunk palette decode | Network paletted v8/v9 → World columns |
| SubChunk request mode | Limitless/limited + apply SubChunk payloads to world |
| PlayerAuthInput | 67-flag BitSet + sprint/sneak/jump mapping |
| InventoryContent / Slot | Wired into `Inventory` hotbar |
| Encryption | NetherNet relies on DTLS; RakNet-style app encrypt N/A |
| Play on real public BDS | **Not guaranteed yet** — not verified against a live 1.26.52.3 in this session |
| AI LLM planner | Working against any Chat Completions URL (`createAIBot`) |

---

## 7. Priority backlog for next agent

1. **Verify live join** against local BDS 1.26.52.3 with injected WebRTC (`werift` or `wrtc`). Capture real GET `/v1/join` JSON and POST answer, including whether BDS sends `a=identity`.
2. Align identity JWT claims with vanilla IdP if live answers fail verification (fingerprints + `cpk` binding).
3. Blob-cache path (`ClientCacheBlobStatus` / hashes) when `cacheEnabled` is true on SubChunk.
4. Expand **ItemRegistry/BlockRegistry** from a Bedrock data dump (runtime IDs from StartGame palette).
5. Keep **bun test** green; add integration tests when a BDS is available.
6. Do **not** break AI `createAIBot` API without migration notes.

---

## 8. REQUIRED: Mineflayer comparison workflow

When the user asks for comparison with Mineflayer, or before large API redesigns, **do this**:

### 8.1 Download latest Mineflayer source

```bash
cd /tmp
curl -L -o mineflayer-latest.zip https://github.com/PrismarineJS/mineflayer/archive/refs/heads/master.zip
unzip -o mineflayer-latest.zip -d /tmp/mf-src
```

### 8.2 Install and run cloc (or a line counter if apt/cloc is blocked)

Compare: **files, LOC, languages %**. Latest numbers live in `docs/MINEFLAYER.md`.

### 8.3 Deep comparison dimensions

Always cover edition/protocol, size, architecture, dependencies, pathfinding, auth, AI, maturity.  
**Do not claim Aether is a drop-in Mineflayer replacement.**

---

## 9. Public API cheat sheet

```ts
import {
  createBot, createAIBot,
  GoalNear, GoalBlock,
  AETHER_VERSION, TARGET_PROTOCOL,
  encodeGamePacket, PacketId,
  NetherNetTransport, BDSSession,
  createMockPeerConnection,
  snappyCompress, buildColumnRequest,
} from "aether-bot";

const bot = createBot({ host, port: 19132, username, offline: true });
await bot.connect();

const ai = createAIBot({
  host, username, offline: true,
  aiApiKey: process.env.AI_API_KEY!,
  aiBaseUrl: "https://api.openai.com/v1/chat/completions",
  aiModel: "gpt-4o-mini",
});
```

---

## 10. Coding rules for next agent

1. **Bun + TypeScript** — do not convert the project to pure Node/JS without reason.  
2. **Keep tests green** — `bun test` after changes.  
3. **Bedrock-first** — never assume Java packets or Mineflayer APIs exist at runtime.  
4. **Prefer extending codecs/session/transport** over one-off hacks in `Bot.ts`.  
5. **Honesty** — do not claim live multiplayer works until verified against real BDS.  
6. **Security** — never commit real API keys, GH tokens, or Xbox tokens; use env vars.  
7. **Brand** — keep name **Aether** / `aether-bot`.  
8. If user pastes secrets (tokens), warn to revoke; do not echo them back unnecessarily.

---

## 11. Key implementation notes

### NetherNet (BDS 1.26)
- Signaling TCP HTTP on `server-port` (often 19132)  
- Gameplay over WebRTC (UDP/DTLS)  
- No classic RakNet `0xFE` batch path on pure NetherNet  
- Inject `createPeerConnection` when global RTC is missing  
- `a=identity` on offer via login ES384 key; answers may be required (`requireServerIdentity`)

### Login
- Offline: `JwtChain.buildOfflineChain` → Login packet  
- 1.26.10+: multiplayer token style also produced  
- Online: XboxAuth then `buildOnlineChain`  
- After NetworkSettings: `ClientCacheStatus { enabled: false }`

### Movement
- Modern BDS expects **PlayerAuthInput**, not only MovePlayer  
- `BDSSession` sends at 20 Hz after spawn  

### World
- Full paletted LevelChunk **or** request-mode columns + SubChunkRequest/SubChunk

---

## 12. Deliverables expected from next sessions

- Keep shipping updated **zip** of full tree when user asks for source  
- Update `AETHER_VERSION` in `src/core/version.ts` + `package.json` on meaningful releases  
- When comparing to Mineflayer: **download latest source + run cloc + deep writeup** (section 8)  
- Progress toward **verified** spawn on local BDS  

---

## 13. Quick start prompt for next AI agent

Copy-paste:

> You are continuing **Aether** (`aether-bot`), a TypeScript Minecraft **Bedrock** AI bot engine for BDS **1.26.52.3** protocol **2193** / **NetherNet**. Read `HANDOFF.md` fully. Work in `bedrock-ai-engine/`. Use Bun. Run `bun test` after changes. Do not treat this as Mineflayer or Java Edition. For Mineflayer comparisons: download latest Mineflayer source from GitHub, install `cloc`, compare LOC/files/architecture, and state edition differences clearly. Priority: real WebRTC join to BDS, chunk decode, PlayerAuthInput fidelity, keep AI `createAIBot` working. Never commit secrets.

---

*Handoff written for Aether 1.4.0-alpha. Update this file when architecture changes materially.*
