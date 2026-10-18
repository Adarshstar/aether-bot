# Aether 1.8.1-alpha

AI bot engine for **Minecraft Bedrock BDS 1.26.52.3** (protocol **2193**, NetherNet).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layered design:

`Transport → Protocol → Bot → AI / Scripts / Decision`

## CI

GitHub Actions runs on every push/PR:

- `bun test` (113+ tests)
- Pathfinder benchmarks  
- Mock join validation  
- `bun build index.ts --target=bun`  
- Layer boundary checks  

## Quick start

```bash
bun install
bun test
bun add werift && bun run join:fast
```

## License

MIT
