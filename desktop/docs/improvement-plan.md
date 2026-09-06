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

## Remaining sequence

3. Replace indefinite startup loading on capability/session failure with an error and retry action.
4. Clear subscription input only after successful import.
5. Repair log autoscroll at the buffer limit; pause when reading older entries.
6. Bound subscription response time and size; provide cancellation and retry feedback.
7. Reduce traffic-statistics overhead and suppress overlapping/stale requests. Validate the current core's streaming contract before replacing polling.
8. Add accurate, cancellable health-check progress with careful sequential testing (see below).
9. Add server search, latency sorting, and bounded rendering for long lists.
10. Clarify connection/loading/error states, contextualize TUN helper setup, preserve server-list navigation state, add log search/filter/export and redact subscription tokens in displayed URLs.
11. Add Russian localization and system/light theme support, with visual checks of affected pages.

## Health-check constraint and core findings

Health-check changes are currently deferred by the user. Do not change health-check logic in the following steps. The earlier requirement remains: careful sequential health checks, since bursts of SSL handshakes may trigger censorship; do not parallelize tests to improve speed.

The current Desktop `healthAll` loop is sequential **between groups**, but `MihomoApi.healthCheck` calls `GET /group/{name}/delay`. In the core dependency resolved from the current `go.mod` (`github.com/l0nelynx/cheezy-core` at `218fd7fcf9d1`):

- `hub/route/groups.go`, `getGroupDelay`, waits for `group.URLTest` and returns one final JSON result.
- `adapter/outboundgroup/groupbase.go`, `GroupBase.URLTest`, starts a goroutine for each member. Thus a single group request can already create a burst.
- `hub/route/proxies.go` provides an individual proxy delay request returning a single result.

Before implementing progress, design a single main-process queue using individual proxy checks, with spacing, no overlapping runs, and cancellation when disconnecting or changing profiles. Progress should count completed checks (including failures) and show the current server; do not invent within-request percentages. Check nested groups, duplicate members, group-specific test parameters and background checks before claiming global handshake serialization. No core or health-check behavior was changed in step 1.

The local bundled core failed source-hash parity in the initial audit. Resolve the artifact mismatch before using it to validate behavior against these source findings.
