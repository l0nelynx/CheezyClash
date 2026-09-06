# CheezyClash Desktop

Desktop client for Mihomo (Clash.Meta). Stages A (proxy MVP) and B (TUN + Windows helper).

📚 **Full documentation:** [CheezyClash docs](https://l0nelynx.github.io/CheezyClash-docs/)

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

When a registered installation is found, the RU/EN NSIS wizard defaults to
**Update in place**. This keeps its installation scope, directory, AppUserModelID
and existing Desktop/Start Menu shortcuts (including intentionally deleted
shortcuts). It does not run the old uninstaller, unregister the app or remove
Windows pins. A silent installation also updates the existing location; `/D`
does not relocate an update. Select **Change installation location or users**
for a reinstall instead; moving an installation can reset shortcuts/pins.

Before replacing files, the installer stops the helper service owned by that
directory, then terminates the installed app/core and waits for exit. It uses
exact executable paths, not process names; another installed/portable copy or
another product's helper is left alone. If stopping fails (for example, service
control requires administrator rights), installation aborts before replacement;
rerun the installer as administrator. Updating reuses the helper service rather
than deleting/recreating it. First TUN connect still syncs the core SHA256
allowlist via the app (same as `Ensure helper` on Home).

`npm run test:installer` checks the upstream NSIS extension contract and, on
Windows, mocked process/service isolation. `npm run test:installer -- --compile`
compiles tiny CheezyClash/CheezyVPN installer fixtures on Windows, including the
uninstaller; it never installs them or launches the app. The fixtures omit the
updater's separate `elevate.exe` payload (not used by the installer UAC flow).
Before release, check an actual old-version → new-version upgrade in a disposable
Windows environment: pin the app, hash the `.lnk` files, start a tunnel, update,
verify unchanged links/pins and the new version, then verify normal uninstall.

Linux / macOS: `npm run dist:linux` / `npm run dist:mac`. Linux publishes both
AppImage and `.deb`; install the `.deb` when you need reliable
`cheezyclash://` desktop integration. A standalone AppImage needs a desktop
integration tool before the browser can discover its custom-scheme handler.

## Deep links

- Open Desktop owns only `cheezyclash://add/<encoded HTTPS URL>`.
- Account-login deep links are intentionally rejected in the Open build.
- Development runs never register production schemes to `electron.exe`; pass a
  URL in argv when testing the parser locally.
- CheezyVPN uses its own `cheezyvpn://` scheme. Android keeps `cheezy://`.

## Zashboard and controller password

Desktop preserves `secret` from the active profile YAML; it never replaces it
with a generated global password. Missing, null or explicitly empty `secret`
means no controller authentication. The controller remains bound to loopback
(`127.0.0.1:9090`); use a non-empty secret if other local software is untrusted.

Without dashboard settings, Desktop supplies `external-ui: ui` and the Zashboard
FiraSans ZIP URL. Explicit UI paths/download URLs are preserved. The Zashboard
button opens the local panel with the applied controller's host, port and secret
in `#/setup?...`, using URL encoding. The fragment is not sent in the HTTP request
but can remain in browser history; do not share the complete setup URL.

Both direct and helper launches read credentials from the effective YAML.
Subscription updates that are not applied do not change the client's credentials.
Changing `secret` or the UI directory requires a coordinated core restart because
Mihomo's soft `PUT /configs` does not recreate the controller. Other live changes
still use a soft reload, serialized with start/stop/profile switching.

A last-applied controller snapshot allows a restarted UI to reconnect to a helper
even when the on-disk profile has since been refreshed. During upgrade, the old
generated `config.yaml` is used only to reconnect to an already-running core;
the next start/reload uses the source YAML password. The legacy global
`controllerSecret` setting is no longer read or written.

## Scripts

Windows installers now require administrator rights before running, including
per-user updates; existing install locations and shortcut identities are retained.
The helper is registered with Manual startup and is started for TUN on demand.
Interactive users receive only the additional service start/stop rights, preserving
the existing ACL. A normal app exit disconnects first, then stops this installation's
helper; closing to the tray keeps it running. Old portable installations may need
one elevated helper repair to migrate their service configuration. A service owned
by another installation is not replaced or stopped.

Update preparation waits for the owned service to stop before replacing files.
Unknown executable paths now block replacement instead of being treated as absent.
On the development host, the legacy CheezyVPN service was Automatic and its ACL
did not grant interactive users start/stop access; its privileged process path was
invisible to an unelevated process query. This explains the permissions obstacle;
the original failing installer was not replayed. Tests mock service mutations, and
installer compilation verifies the actual EXE's `requireAdministrator` manifest.
The running host service was left unchanged during validation.

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
| `npm run test:controller` | YAML credentials, HTTP auth, reload/profile races and Zashboard setup URL (no real VPN/browser) |
| `npm run test:profile-races` | Subscription refresh versus import, deletion, account replacement, and concurrent refreshes (mock HTTP, isolated temporary profiles) |
| `npm run test:system-proxy` | Windows proxy snapshot, conditional restoration, partial failure/restart recovery, and legacy ownership checks (mock registry; no network changes) |
| `npm run test:subscription-download` | Download deadline, size limits, HTTPS redirects, errors and cancellation |
| `npm run test:traffic-stream` | Stream chunking, deduplication, reset and invalid frames |
| `npm run test:helper-lifecycle` | Client exit, restart, literal paths and one-time repair with OS boundaries mocked |
| `npm run test:installer -- --compile` | Mock service lifecycle/ACL tests and compile both branded installers; assert elevation in the generated EXE manifest (no installation) |
| `npm run test:ui` | After `npm run build`: isolated Electron UI checks with mocked IPC, blocked HTTP(S), temporary preferences and screenshots |

Appearance settings offer English/Russian and system/light/dark themes. Preferences
persist locally; system mode follows OS theme changes. Server lists support search
and sorting, and logs support search, filtering and redacted export. Implementation
status and validation limitations are recorded in [the improvement plan](docs/improvement-plan.md).

On Windows, enabling the system proxy saves its previous address, bypass list,
and enabled state. Disconnect restores these values only while the current
registry values still match the client's writes. Changes made by another app
are preserved. Reconnect after an external change captures a new baseline.
A persistent write-ahead snapshot supports recovery from partial writes; startup
retries restoration when no running core is detected. Installations upgraded
from a version without snapshots can only disable a matching legacy client proxy;
their original settings cannot be recovered retroactively. This restoration
behavior currently applies to Windows; macOS/Linux restoration remains pending.

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
