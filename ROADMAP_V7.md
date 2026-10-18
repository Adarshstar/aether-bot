# 🚀 Aether Engine — Alpha V7 Roadmap
_Status: IN PROGRESS — last updated 2026-10-14_

## Phase 1 — 🧠 Brain Resilience (Priority: NOW)
- [x] Roadmap drafted
- [ ] **Multi-Model Fallback Chain**: try Gemini Flash Latest → Gemini 2.0 Flash → Kaggle Claude proxy → local Ollama, in order, on any HTTP error/503/timeout
- [ ] **Smart retry/backoff**: exponential backoff per provider instead of instant fail-to-wait(2000ms)
- [ ] **Response caching**: cache last N observation→action pairs to survive short outages without spamming APIs
- [ ] **Token/cost guard**: trim system prompt + history dynamically if provider is rate-limited

## Phase 2 — 🗺️ Navigation & Combat
- [ ] **Pathfinder V2**: scaffolding placement, ladder climbing, parkour gap-jumping
- [ ] **ToolManager wake-up**: wire `ToolManager.equipForBlock` into the dig/mine action so bot auto-equips correct tool before digging
- [ ] **Combat upgrade**: shield blocking, strafing/kiting in `Combat`/`PvP` modules, target prioritization (lowest HP / closest threat)
- [ ] **Guard mode tuning**: multi-target threat queue instead of single nearestEntity

## Phase 3 — 🛠️ Stability & Ops
- [ ] **Guardian Loop v2**: proper nohup+disown supervisor script with crash-reason logging and max-restart backoff (not fixed 10s)
- [ ] **Health Dashboard**: lightweight local HTTP endpoint (`/status`) exposing HP, food, position, mode, uptime, last LLM latency
- [ ] **Structured logging**: timestamped JSON log lines instead of raw console.log, rotated daily
- [ ] **OpenClaw `aether` agent sync**: route bot chat events back into the `aether` OpenClaw agent for cross-reporting

## Phase 4 — ✨ New Powerful Features
- [ ] **Persistent Memory**: JSON file of known players + past interactions, injected into LLM system prompt
- [ ] **Group Coordination**: `follow_entity` + `guard` combo so bot can escort/bodyguard a player
- [ ] **Automated Resource Gathering**: dedicated `mine_area`/`collect` scripted loops (already scaffolded in `CollectBlock`) wired into DecisionEngine as a mode
- [ ] **Voice-chat text bridge**: experimental, deferred until a voice-to-text source is available on the server

## Working order
1. Phase 1 (brain resilience) — fixes the 503 errors seen in V6 testing, biggest reliability win
2. Phase 2 (combat/tools) — most visible gameplay upgrade
3. Phase 3 (ops) — keeps it running unattended
4. Phase 4 (features) — stretch goals
