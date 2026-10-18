# Aether vs Mineflayer (refreshed 2026-10-15, V8 kickoff)

Source: `https://github.com/PrismarineJS/mineflayer/archive/refs/heads/master.zip` (re-downloaded fresh)
npm registry + GitHub releases confirm: **mineflayer@4.39.0**, published 2026-09-06, Node >=22 required.
No newer release exists as of this check — the earlier 2026-10-06 numbers were still current.

They are **not interchangeable**. Mineflayer is a Java Edition client. Aether is a Bedrock Edition client for BDS 1.26.52.3 / protocol 2193 / NetherNet.

## Size (source, excluding node_modules)

Recounted this session from a fresh GitHub master zip (`cloc` unavailable in sandbox; raw line counts via `find`+`wc -l`).

| Codebase | Files | Lines | Notes |
|----------|-------|-------|--------|
| Mineflayer `lib/` | 55 `.js` | 7,492 | 43 plugins under `lib/plugins/` |
| Mineflayer whole tree | 225 `.js`/`.md`/`.json` | 36,925 | includes docs, tests, examples |
| Aether `src/` | 77 `.ts` | 13,423 | Bedrock codecs + physics + AI in-tree |
| Aether `tests/` | 24 `.ts` | 1,498 | `bun test`, 120 tests passing |

Aether's `src/` has grown ~79% since the last count (58→77 files, ~7.5k→13.4k lines) across V6/V7 work: physics engine, PvP/kiting, fallback LLM chain, health dashboard, persistent memory, farm/script/goal modules. Mineflayer's core `lib/` stayed flat (7,494→7,492) since it delegates most growth to companion packages instead of the core repo.

Mineflayer's real surface is larger once you count companion packages it depends on (`minecraft-protocol`, `prismarine-chunk`, `prismarine-world`, `prismarine-physics`, `mineflayer-pathfinder`, `minecraft-data`, …). Aether keeps those concerns inside this tree.

## Architecture

| | Mineflayer | Aether |
|--|------------|--------|
| Edition | Java | Bedrock |
| Transport | TCP via `minecraft-protocol` | NetherNet (HTTP `/v1/join` + WebRTC data channels) |
| Core style | Thin bot + **43 inject plugins** under `lib/plugins/` | Hot APIs **on Bot** (dig, place, goTo, inventory, pvp, autoeat, collect) |
| Pathfinding | Separate `mineflayer-pathfinder` package | Built-in A* Pathfinder + Goal* classes, node pool, path cache |
| Auth | Mojang / Microsoft (Java) | Xbox Live + ES384 JWT chain / offline multiplayer token |
| World | `prismarine-world` + `prismarine-chunk` | Internal Chunk (Y -64…319) + paletted LevelChunk + SubChunkRequest |
| Movement | Physics plugin + position packets | 20 Hz **PlayerAuthInput** varint-flag-list (just fixed a decode/encode mismatch bug) |
| AI | None first-class (community plugins only) | `createAIBot({ aiApiKey, fallbackProviders })` — multi-provider LLM planner w/ backoff |
| Combat | `mineflayer-pvp` plugin | Built-in `Combat` + `PvP` (kiting, priority targeting) — **V8 is merging these** |
| Observability | None built-in | `PerfMonitor` + `HealthDashboard` HTTP `/status` endpoint |
| Persistence | None built-in | `AetherMemory` — per-player JSON memory across restarts |
| Maturity | Production Java, years of servers, huge plugin ecosystem | Alpha Bedrock; live public BDS join not yet verified in this session |

## Where Aether is ahead

- **Single-binary engine**: no `prismarine-*` dependency tree to version-match; Bedrock codecs, physics, and AI live in one repo at one version.
- **AI-first**: Mineflayer has zero built-in LLM integration — every "AI Minecraft bot" project bolts an LLM on top externally. Aether's `Agent`/`DecisionEngine`/`FallbackLLMClient` are core.
- **Modern Bedrock target**: Mineflayer cannot speak Bedrock/NetherNet at all — different game, different wire protocol entirely.

## Where Mineflayer is ahead (and V8 should close the gap)

- **Maturity & correctness**: thousands of real servers validate Mineflayer's packet handling daily. Aether just found and fixed a PlayerAuthInput encode/decode mismatch that would have silently corrupted every movement tick against a real server — this class of bug is the #1 V8 risk area.
- **Plugin ecosystem**: 43 first-party plugins + hundreds of community ones (viewer, armor-manager, auto-eat variants, web-inventory). Aether's extension points (`scripts.define`, `loadPlugin`) exist but have near-zero community plugins yet.
- **Battle-tested pathfinder**: `mineflayer-pathfinder` handles parkour, boats, and complex terrain that Aether's Pathfinder V1 does not yet (scaffolding placement, ladder climbing, and gap-jumping are still open items from the V7 roadmap, carried into V8).

## 43 built-in Mineflayer plugins (for reference)

abilities, anvil, bed, block_actions, blocks, book, boss_bar, breath, chat, chest, command_block, craft, creative, digging, enchantment_table, entities, experience, explosion, fishing, furnace, game, generic_place, health, inventory, kick, particle, physics, place_block, place_entity, rain, ray_trace, resource_pack, scoreboard, sequence, settings, simple_inventory, sound, spawn_point, tablist, team, time, title, villager

Aether maps many of these as **core methods or first-class modules** (`inventory`, `combat`, `pvp`, `autoeat`, `collect`, `windows`, `physics`, `chat`, `farm`) rather than inject-only plugins. Plugins remain optional via `bot.loadPlugin`.

**Verdict:** not interchangeable (different Minecraft editions entirely), but Aether's core-engine philosophy + built-in AI planner make it more "batteries included" for AI-bot use cases, while Mineflayer wins on protocol maturity and ecosystem size. Do not claim Aether is a drop-in Mineflayer replacement.
