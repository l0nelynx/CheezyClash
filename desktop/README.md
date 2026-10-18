# CheezyClash Desktop

Desktop client for Mihomo (Clash.Meta), with Proxy mode and TUN through Windows and Linux system helpers.

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
npm run build:helper # Host-platform helper (Windows/Linux TUN)
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

## Linux TUN helper

Linux TUN requires a systemd host, `/dev/net/tun`, and administrative authorization
through polkit (`pkexec`) for first installation or an executable update. Run the
desktop app as your normal user. Choose TUN or **Install helper** to install it.
Proxy mode does not require installation. `npm run dist:linux` builds and bundles
the helper automatically.

The installer copies the helper and core out of the AppImage into
`/usr/local/libexec/cheezyclash/<UID>/`, owned by root and not writable by the user.
It installs `cheezyclash-helper-<UID>.socket` and `.service` in
`/etc/systemd/system/`. The socket is enabled at boot; the helper is activated on
access, and starts the core only on a connection request. The service runs as the
desktop user's UID with only `CAP_NET_ADMIN`, `CAP_NET_RAW`, and
`CAP_NET_BIND_SERVICE`, not as root. Configurations and downloaded resources remain
owned by that user. Features requiring additional privileges (for example changing
the system time or inspecting other users' processes) are intentionally unavailable.

The Unix socket `/run/cheezyclash-helper-<UID>.sock` has mode `0600`; the server also
checks kernel peer credentials. It exposes only ping/start/stop. The installed core
path is fixed, arguments are constructed by the helper, and neither executable
replacement nor allowlist changes are available over the socket. Both executable
hashes are checked during setup; updates require another polkit authorization.
Linux never uses the legacy localhost HTTP helper or setuid inside an AppImage.
Stopping sends SIGTERM and waits for graceful core cleanup, then kills a stalled
process after eight seconds. Logs are written to the system journal. A normal app
exit stops the core; closing to the tray keeps the connection. The helper remains
available for later requests and does not start a tunnel automatically after reboot.

Fedora Atomic's writable `/etc` and `/usr/local` (backed by `/var/usrlocal`) are used
without remounting `/usr`. The installer restores SELinux file contexts when
`restorecon` is available; it never disables SELinux. A host that forbids local
system services, or uses a different init system, must use Proxy mode in this version.

For Distrobox, install the same app version's helper **on the host first** by opening
CheezyClash on the host and enabling TUN once. Installation inside a container is
rejected. A container client can reuse the host helper only if the socket is
accessible (through `/run/host/run` or `/run`), the UID is preserved, networking is
shared with the host, and profile/home paths refer to the same files on the host.
The start request checks the network namespace and host file accessibility.
Containers with private networks or private profile storage are not supported;
run the desktop app on the host instead. No automatic container privilege escalation
or container-to-host installation is performed.

Diagnostics and removal, run on the host as the desktop user:

```sh
journalctl -u "cheezyclash-helper-$(id -u).service" -b
pkexec "/usr/local/libexec/cheezyclash/$(id -u)/cheezy-helper" --uninstall "$(id -u)"
```

Removal stops the owned service/socket and removes only its unit files and installed
binaries, leaving user profiles intact. Removing the AppImage alone leaves the
independently installed helper in place.

Validation: `npm run test:linux-helper` exercises client authorization and container
boundaries with mocked OS calls. `cd helper && go test -race ./...` on Linux also
checks Unix peer credentials, child lifecycle and systemd unit syntax. Before a
release, smoke-test an actual AppImage install/connect/disconnect/update/uninstall
on a systemd host, Fedora Atomic with SELinux enforcing, and a Distrobox using shared
host networking and profiles. These tests require a real Linux environment and
are not replaced by cross-compilation from Windows.

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

### Startup and automatic connection

On Windows, **Launch at system startup** uses a Task Scheduler logon task for the
current user, with no configured delay, password, elevation, idle/network
prerequisite, or battery restriction. It runs the installed executable with
`--hidden` at normal process priority. Windows still controls when CPU time is
available; this does not guarantee starting before every other application.
The task is scoped to the product, Windows user and executable path. On the first
launch after upgrading, an enabled legacy Run entry is migrated only after the
new task is registered and verified. A registration failure leaves the legacy
entry in place and is logged. Manage this startup preference inside the app;
scheduled tasks are separate from Windows' ordinary Startup Apps list.
Disabling startup removes the owned task, and uninstall removes owned tasks for
that executable across users. Another installation's entries are preserved.

A `--hidden` launch starts the tray and core without creating a BrowserWindow or
loading React. Opening from the tray, a manual second launch, macOS activation,
or a deep link creates the window on demand. Repeated `--hidden` launches keep
the running instance hidden. Proxy recovery still completes before connection
work starts, and tray status follows core events without renderer polling.

**Connect when the app starts** connects the saved active profile before account
subscription synchronization. Sync runs afterward without hot-reloading the
connected core; updated profile data applies on the next explicit reload or
connection. If there is no saved profile, startup obtains subscriptions first.
A manual lifecycle action during that wait prevents a late auto-connect.
The `startup:` log entries record main readiness, tray readiness, first window
paint, connection readiness and sync completion in milliseconds since process start.

`npm run test:startup` checks scheduler migration/isolation using mocked OS
boundaries, plus main-process lazy-window behavior and startup ordering.
Windows-only `npm run test:startup:scheduler` registers a unique temporary task
pointing to a nonexistent test executable, checks the real Scheduler readback,
idempotency, uninstall cleanup and disabling, and removes the task in `finally`.
It never runs the task or changes installed application startup entries.

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
and sorting, with independent list/grid/carousel group layouts and list/large-grid/small-grid
server layouts that persist locally. Carousel shows a scrolling row of group tabs
and the selected group's servers without expansion controls. Large-grid cards show
`serverDescription` and `type : network` from the active YAML. Search, sort, and
Test all share the Proxies heading row. Layout buttons use icons with tooltips;
list/grid layouts offer expand/collapse all. Carousel tabs support mouse-wheel
and drag scrolling, and server lists leave space below their last item.
Home opens Custom Rules from its rule counter;
the editor includes a quick guide in English and Russian. Logs support search,
filtering and redacted export. Implementation
status and validation limitations are recorded in [the improvement plan](docs/improvement-plan.md).

The **Connections** tab polls the applied Mihomo controller while open, showing
active destinations, process names, matched rule type/value, the complete route
from category groups to the final proxy, download/upload speeds, and elapsed time.
Speeds use byte-counter differences between samples; the first sample shows `—`.
Search covers hosts, IPs, processes, rules and routes. Optional `process-name`
grouping persists locally, with collapsible process groups. Connections without
process metadata appear in **Unknown process**. Controller errors clear stale rows
and retry automatically; disconnecting clears the list.

After `npm run build`, run `npm run preview:connections` for a separate, interactive
window with clearly labelled demo data, no external network access, and temporary
preferences. It does not start the core or change system proxy/TUN settings.
`npm run test:connections` checks rate calculation and runs isolated Electron UI
checks for grouping, search, sorting, themes, narrow layouts and connection states.

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
