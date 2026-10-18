# 🚀 Aether Engine — Alpha V9 Roadmap
_Status: DESIGN PHASE — started 2026-10-18_

## V8 Recap (COMPLETED)
- ✅ Chunk storage: lazy 16³ sections, ~0 cost for air-heavy columns
- ✅ Pathfinder: real cross-search node pool + liquid-aware costs (1.6x)
- ✅ Decision/Agent arbitration: shared `Arbiter` priority stack (Survival > Combat > Command > Social > LLM)
- ✅ Combat/PvP merge: single `CombatController` with target-lock, cooldowns, shield timing, kiting
- ✅ Protocol fidelity: audited `InventoryContent`/`itemStack` — no encode/decode drift
- ✅ Observability: `PerfMonitor` wired into `/status` endpoint + 45ms tick-budget warnings
- ✅ Brain resilience: `FallbackLLMClient` with emergency `lastGoodResponse` cache + adaptive history trimming
- ✅ Navigation V2: ladder/vine climbing + auto-tool equip via `ToolManager`
- ✅ Stability/Ops: Guardian Loop v2 (supervisor.sh), structured JSON logger, OpenClaw sync bridge
- ✅ Persistent memory: `AetherMemory` with player notes injected into LLM system prompt

---

## V9 THEME: **"Autonomy & World Mastery"**
Goal: Bot operates unattended for hours, builds/defends a base, coordinates with players, and survives dynamic threats without micromanagement.

---

## Phase 1 — 🧠 Advanced AI Planning (Priority: NOW)
- [ ] **Hierarchical Task Network (HTN) Planner**: Decompose high-level goals ("build iron farm") into ordered subtasks with preconditions/effects
- [ ] **World Model / State Prediction**: Simulate action outcomes 5-10 ticks ahead (physics, combat, pathfinding) to avoid fatal plans
- [ ] **Multi-Objective Utility Scoring**: Weight survival, resource gain, social, exploration dynamically per personality
- [ ] **LLM Tool-Use Schema**: Structured function calling for `dig`, `place`, `craft`, `smelt` instead of free-form JSON actions
- [ ] **Plan Repair / Replanning**: On failure (block missing, path blocked, combat interrupt) auto-replan from current state

## Phase 2 — 🏗️ Construction & Base Building
- [ ] **Blueprint System**: JSON schema for structures (walls, farms, houses) with relative block coordinates
- [ ] **Build Planner**: Given blueprint + anchor position → ordered place sequence with scaffolding auto-generation
- [ ] **Scaffolding Engine**: Auto-place/remove temporary blocks for vertical/horizontal reach during construction
- [ ] **Resource Budgeting**: Track required materials, auto-queue gathering missions before build starts
- [ ] **Defense Perimeter**: Auto-place walls, lighting, iron golems around claimed chunk radius

## Phase 3 — 🤝 Multi-Agent / Group Coordination
- [ ] **Squad Manager**: Multiple bots share world state, divide labor (miner, builder, guard, farmer)
- [ ] **Shared World Knowledge**: Sync `AetherMemory` + chunk cache across bot instances via local pub/sub
- [ ] **Formation Movement**: Guard escort, patrol routes, fleet pathfinding for 2-5 bots
- [ ] **Player Command Bus**: Discord/Chat commands dispatch to specific bot or squad (`!squad1 guard me`)

## Phase 4 — 🌍 World Mastery Systems (Priority: NOW — DELIVERED)
- [x] **Dynamic Threat Map**: `src/mastery/ThreatMap.ts` — heatmap of hostile spawns, PvP zones, lava/void hazards with decay
- [x] **Resource Vein Tracking**: `src/mastery/VeinTracker.ts` — persistent ore/farm/chest memory across sessions (`.aether-memory/veins.json`)
- [x] **Automated Farming Suite**: `src/mastery/FarmSuite.ts` — crop plots, animal pens, villager traders with auto-harvest/breed
- [x] **Economy/Trading**: `src/mastery/Economy.ts` — villager trade optimization, price tracking, deficit tracking, recommended trades
- [x] **Integration**: Wired into `AIBot.ts` (`bot.threatMap`, `bot.veinTracker`, `bot.farmSuite`, `bot.economy`)
- [ ] **Live validation**: Test against Lotus server (lotus.taspmail.online:19132)
- [x] **HTN planner integration**: ThreatMap and VeinTracker wired into HTN planner preconditions — `safeToMine`/`safeToBuild` block digging/building in dangerous areas; `mine_iron` uses VeinTracker for best known vein; threat-aware replanning via `ensure_survival`

## Phase 5 — ⚡ Performance & Scale
- [ ] **Chunk Streaming**: Load/unload columns dynamically by distance, persist dirty sections to disk
- [ ] **Parallel Pathfinding**: Offload A* to worker threads via `worker_threads` for 10+ concurrent paths
- [ ] **Batched Protocol**: Combine multiple packets per tick (movement + inventory + chat) to reduce WebRTC overhead
- [ ] **Memory Profiling**: Per-module heap tracking, auto-GC hints, leak detection in long runs

---

## Working Order
1. **Phase 1 (HTN Planner + World Model)** — unlocks all autonomous complex behavior
2. **Phase 2 (Blueprint + Build)** — visible "base building" capability
3. **Phase 3 (Squad/Group)** — multi-bot coordination force multiplier
4. **Phase 4 (World Mastery)** — long-term autonomous survival
5. **Phase 5 (Scale)** — required once bot count / world size grows

---

## Architecture Notes for V9
- New module: `src/planning/HTNPlanner.ts` (core, no LLM dependency)
- New module: `src/planning/WorldModel.ts` (simulates tick outcomes)
- New module: `src/construction/Blueprint.ts` + `BuildPlanner.ts`
- New module: `src/squad/SquadManager.ts` (for multi-bot)
- Extend `AetherMemory` with `WorldKnowledge` (ore veins, bases, threat zones)
- `DecisionEngine` mode `"autonomous"` → delegates to HTN planner instead of personality dice rolls
- Keep `Arbiter` as the single control authority — HTN proposes, Arbiter authorizes