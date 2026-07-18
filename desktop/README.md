# CheezyClash Desktop

Desktop client for Mihomo (Clash.Meta). Stages A (proxy MVP) and B (TUN + Windows helper).

## Stack

- Electron + Vite + React + TypeScript + Tailwind
- **mihomo** sidecar built from the same `core/src/main/golang` go.mod as Android `libclash` (published on `libclash-<hash>` releases — not stock MetaCubeX Alpha)
- Go **Helper Service** on Windows (FlClashX-style privileges)

## Quick start

```bash
cd desktop
npm install
npm run fetch-core   # download sidecar for this OS (same go hash as Android)
# or: npm run build-core  # local go build when the release asset is missing
npm run build:helper # Windows helper (needed for TUN)
npm run dev
```

## Release (Windows)

Build a ready installer + portable zip:

```bash
cd desktop
npm install
npm run fetch-core
npm run build:helper
npm run dist:win
```

Artifacts land in `desktop/release/`:

- `CheezyClash-win-x64.exe` — NSIS installer (registers helper service)
- `CheezyClash-win-x64.zip` — portable

Filenames omit the version so GitHub `…/releases/latest/download/CheezyClash-win-x64.exe` links stay stable.

On Windows, packaging skips code signing (`signAndEditExecutable: false`) so electron-builder does not need Developer Mode for winCodeSign symlinks. Set `CSC_IDENTITY_AUTO_DISCOVERY=false` if a local cache still tries to extract signing tools.

The NSIS installer stops/recreates `CheezyHelperService` from `resources/helper`. First TUN connect still syncs the core SHA256 allowlist via the app (same as `Ensure helper` on Home).

Linux / macOS: `npm run dist:linux` / `npm run dist:mac` (CI builds these; Windows is the primary QA target).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev app |
| `npm run build` | Compile main/preload/renderer |
| `npm run dist:win` | Windows NSIS + zip |
| `npm run fetch-core` | Fetch mihomo sidecar for current go.mod hash |
| `npm run build-core` | Build host mihomo from go.mod locally |
| `npm run build:helper` | Build Go helper |
| `npm run sync-version` | Sync `package.json` version from `app/version.properties` |
| `npm run icons` | Rasterize black OS logos → PNG/ICO for tray & installer |
| `npm run smoke` | Smoke-test mixed-port (core must be running) |
| `npm run typecheck` | TypeScript check |

## Layout

```
desktop/
  src/main/       Electron main: core lifecycle, profiles, proxy, TUN, helper
  src/preload/    Context bridge
  src/renderer/   UI (sidebar shell + pages)
  src/shared/     Shared types
  helper/         Go Windows service + Unix privilege helpers
  scripts/        fetch-core, build-core, build-helper, smoke
  resources/      Bundled core + helper + tray icon
  build/          App icons + NSIS scripts
  electron-builder.yml
```

## Private module (X)

Account/subscription lives in the private repo. Desktop exposes a stable IPC surface in `src/shared/private-api.ts` for overlay integration — see that file.
