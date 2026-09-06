# Android improvement sequence

All ten implementation steps are complete. Health-check execution remains unchanged; no parallel checks or progress changes were introduced.

1. **Profile transactions** (`6134fce`): serialize import, refresh, switch, deletion and logout cleanup on IO; synchronize catalog mutations. Deletion waits for an existing refresh, then removes its result. Failed operations and cancelled waiters do not poison the queue.
2. **Configuration validation** (`c2044fd`): reject malformed/non-object YAML before publishing a download; propagate rebuild failures and atomically replace generated config files. The previous working config survives a validation failure. This validates the YAML structure, not every native-core option.
3. **Account statistics** (`5c3ee58`): derive primary managed-profile display totals without persisting them into profile metadata. User imports and other managed keys retain their own statistics; tags/announcements are preserved.
4. **Deferred background application** (`39e379b`): worker downloads, including managed gateway calls, publish into a separate pending directory. They are promoted only on explicit server selection, profile switching or connection start. Foreground manual refresh keeps its immediate application behavior. A failed core reload retains the update for retry.
5. **Download limits/cancellation** (`e18b4fd`): 60-second overall deadline, existing 20 MB body cap, disconnect on cancellation, cooperative checks before publication, and no unbounded/server-provided HTTP error body in UI.
6. **Logs at capacity** (`bd751d1`): content-based derived filtering, stable entry IDs, scroll tracking and frozen reading snapshots; collectors follow the screen lifecycle, and cancelling logcat destroys its process to unblock idle reads.
7. **Duplicate imports** (`6c1e3a0`): propagate the refresh failure before activation and preserve the supplied response-header validator.
8. **Import UX** (`09e6262`): save URL draft through SavedStateHandle, keep the dialog on failure, prevent duplicate submits, show inline errors and allow cancellation.
9. **Server errors** (`7c84da1`): explicit loading/error/retry and empty states, rejection of incomplete snapshots, request/profile guards, and preservation of existing data on failure.
10. **Browsing and diagnostics** (this commit): server search, profile/name/latency ordering, group/scroll state retained per profile in the ViewModel; log search and redacted file export; lifecycle-aware UI collection; background traffic reads suppressed and notification polling reduced to five seconds with immediate wakeup on UI attachment. Integration checks also preserve configuration-setting values on write failures and report those failures in UI.

## Validation

- `:app:testDirectOpenDebugUnitTest`: 93 tests, no failures/errors/skips.
- `:app:assembleDirectOpenDebug`: arm64-v8a, armeabi-v7a, x86_64 and universal debug APKs.
- `:app:lintDirectOpenDebug`: 0 errors, 87 warnings. See the generated report under `app/build/reports/`; warnings were not suppressed.
- Compared all six health-check method bodies in the UI/service against the pre-change commit: unchanged.
- No Android device was connected. Device UI checks, real VPN reconnection/worker integration, and battery/CPU profiling were not performed. Polling tests verify the scheduling policy, not measured power savings.
- Shared/open code was compiled; the private proprietary implementation is not present in this checkout. The background-defer context is inherited by gateway calls without changing the gateway interface.
- The two pre-existing WAP source/test edits remain outside these commits.
