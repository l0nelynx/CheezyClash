# Desktop improvement sequence

## 1. Profile update races — implemented

- Merge downloaded metadata into the current profile list after network awaits.
- Invalidate in-flight and queued updates when a profile is deleted or replaced by account sync, before they write files.
- Serialize updates of the same profile, including a requested core reload; an error must not block subsequent updates.
- Preserve background updates' `reloadCore: false` behavior.
- Regression coverage: `npm run test:profile-races` exercises production profile/YAML code against isolated temporary files and controlled HTTP responses.

## 2. System proxy restoration — implemented for Windows

- Retain original registry values (including absent/empty values, Unicode and expandable strings) in a persistent snapshot.
- Restore only when current values match the client's last completed or pending write; preserve external changes.
- Keep the original baseline across reconnects and port changes; capture a new baseline after an external change.
- Serialize proxy operations, roll back failed writes, and retain the journal if recovery fails.
- Retry recovery before startup tasks when no running core is detected; do not disturb an already-running helper connection.
- Legacy installations without snapshots only disable an exact matching client configuration. Earlier settings cannot be recovered retroactively.
- `npm run test:system-proxy`: 16 scenarios using mock registry/persistence and production adapter code. No live registry writes or VPN tests.
- macOS/Linux snapshot restoration remains pending; their existing paths were not changed.

## 3–11. Implementation results

3. Implemented startup capability/session timeout, error feedback and retry (`2e8c20e`).
4. Failed subscription imports retain the entered URL (`3a3abae`).
5. Logs continue scrolling at the buffer limit and freeze while reading older entries (`2e62bd1`).
6. Subscription downloads enforce a 30-second deadline, 16 MB limit and HTTPS redirects; manual profile downloads can be cancelled (`9c971f2`).
7. Traffic statistics use a single demand-driven `/traffic` stream, with reconnection backoff and stale-request protection. Hidden/non-Home pages stop requesting samples (`746e74c`).
8. Health-check changes are deferred by user request, including progress. Existing execution logic is preserved.
9. Server search, name/latency sorting and bounded row rendering are implemented. Group expansion, search and sort survive page navigation (`edb8283`).
10. Connection actions and group loading/failure states are explicit; helper setup is contextual to TUN. Logs have search, level filtering and redacted export; displayed subscription URLs hide path/query credentials (`96fe9b3`).
11. Russian/English UI and system/light/dark themes are implemented with persisted preferences. An isolated Electron UI suite verifies startup retry, failed import, 1,000-server rendering, navigation state, logs, URL privacy, language persistence and system theme changes. Home and Settings screenshots were visually reviewed.

## Validation

Type checking, production build and `npm run test:ui` passed. Regression suites passed: auth-gate, deeplink, controller, lifecycle, network-config, custom-rules, subscription-metadata, startup, sparkline, xray-mux-config, profile-races, system-proxy, subscription-download and traffic-stream.

The UI suite uses a temporary Electron profile, mocked IPC and blocked HTTP(S); it does not connect a VPN or modify host proxy settings. Screenshot paths are printed by the runner. Windows proxy restoration remains covered by isolated registry mocks; macOS/Linux restoration remains pending. The bundled-core parity mismatch below remains unresolved, so these checks do not certify the bundled core or a release installer.

## Health-check constraint and core findings

Health-check changes are currently deferred by the user. Do not change health-check logic in the following steps. The earlier requirement remains: careful sequential health checks, since bursts of SSL handshakes may trigger censorship; do not parallelize tests to improve speed.

The current Desktop `healthAll` loop is sequential **between groups**, but `MihomoApi.healthCheck` calls `GET /group/{name}/delay`. In the core dependency resolved from the current `go.mod` (`github.com/l0nelynx/cheezy-core` at `218fd7fcf9d1`):

- `hub/route/groups.go`, `getGroupDelay`, waits for `group.URLTest` and returns one final JSON result.
- `adapter/outboundgroup/groupbase.go`, `GroupBase.URLTest`, starts a goroutine for each member. Thus a single group request can already create a burst.
- `hub/route/proxies.go` provides an individual proxy delay request returning a single result.

Before implementing progress, design a single main-process queue using individual proxy checks, with spacing, no overlapping runs, and cancellation when disconnecting or changing profiles. Progress should count completed checks (including failures) and show the current server; do not invent within-request percentages. Check nested groups, duplicate members, group-specific test parameters and background checks before claiming global handshake serialization. No core or health-check behavior was changed in step 1.

The local bundled core failed source-hash parity in the initial audit. Resolve the artifact mismatch before using it to validate behavior against these source findings.
