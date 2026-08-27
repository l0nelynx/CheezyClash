# Android crash reporting

## Capture and delivery

`CheezyApp` initializes local diagnostics **before** `ClashCore` in `:vpn`.
Firebase stays exclusively in main. There is no native signal handler, global
Go recover, network request, Binder call or teardown in the JVM fatal handler.
The handler records bounded original type/cause/frame data and always delegates
to the previous Android handler. A loader failure before Go output is attached
can only be captured by JVM/system sources.

`nativeConfigureCrashOutput(fd)` duplicates the borrowed FD, calls Go
[`debug.SetCrashOutput`](https://pkg.go.dev/runtime/debug#SetCrashOutput), then
closes its temporary duplicate. The Go runtime owns the final duplicate. `-1`
disables additional output. Reload/stop never disables it; it remains available
through warm-up, teardown and the process lifetime while reporting is enabled.

`CrashStore` holds atomic files in `noBackupFilesDir/crash-reporting`. A policy
epoch and its start time gate both local import and delivery. Disabling revokes
that epoch, clears the queue/raw sources, cancels jobs, disables Analytics and
Crashlytics, clears local Analytics data / resets its app instance ID, and requests
deletion of unsent Crashlytics reports. Re-enabling creates a new epoch; old exit history cannot
be imported. The AIDL refresh and a file observer update a live VPN's output
without restarting the tunnel. No multi-process SharedPreferences cache is used.

A process-lifetime file lock prevents import of a still-open dump, including
on API 28/29 without `ApplicationExitInfo`. A separate importer file lock plus
in-process serialization prevents two importers from racing. Before native
initialization, a persisted 15-minute JobScheduler job is armed. An unexpected
service disconnect or discovery of an earlier crash also schedules a coalesced
one-shot job. Jobs run in main, do not bind/start the VPN, and do not require
network connectivity for local import. Android controls actual scheduling time.
After service teardown and queue processing the safety job is cancelled.
Dead runs on API 30+ without a published system exit yet keep bounded retry
eligibility; no crash is invented from that absence. WorkManager uses a separate
job-ID range (0–1,000,000) to avoid replacing diagnostic jobs.

On API 30+, only this application's exact `:vpn` exit history in the enabled
epoch is considered. The compact `setProcessStateSummary` run ID associates the
record; PID/start-time matching is a fallback. Exit records without a local run
record are not imported: their source version/consent cannot be proved.
On API 31+, a partial projection of the
[AOSP tombstone schema](https://android.googlesource.com/platform/system/core/+/refs/heads/main/debuggerd/proto/tombstone.proto)
reads signal and crashing-thread frames only. Missing/truncated traces are
explicitly incomplete. ANR requires `REASON_ANR`, not merely a trace attached to
another exit reason. Stop, force-stop, reboot, memory kills and unknown exits are
not classified as crashes unless a JVM/Go crash source independently confirms it.

Go + JVM + system evidence for a run is combined under one event ID. Pending
reports can be enriched; a handled marker prevents late evidence from submitting
another event. The queue contains at most 16 sanitized envelopes, with 7-day
retention and a 64 KiB per-report limit. Parsers consume at most 2 MiB per source.
The raw Go dump is app-private/no-backup and removed after processing (or opt-out).

Main startup/foreground and `CrashReportJobService` perform the same import/drain.
At most **four** additional events are handed to the SDK per main process launch,
leaving room in its eight-nonfatal limit. Rest stays queued. `recordException`
does not acknowledge server delivery or durable SDK persistence: a sender crash
between SDK acceptance and our handled marker can duplicate an event; a crash
before SDK persistence can lose it. No internal SDK files/APIs are used and no
process is forcibly restarted to flush reports. Console delivery typically needs
another process launch and may be delayed.

## Report contract and privacy

Categories: `vpn_jvm_crash`, `core_go_crash`, `vpn_native_crash`, `vpn_anr`.
They are synthetic **non-fatals**, not main-process fatal/crash-free events.
Operational errors, proxy timeouts, REJECT, Binder warnings and Logcat are not
report sources. The switch controls both Firebase Analytics and Crashlytics.

The existing atomic policy file is retained: a previous Crashlytics-only opt-out
also opts out of Analytics on upgrade. Main startup and switch changes apply the
same value to `setAnalyticsCollectionEnabled` and `setCrashlyticsCollectionEnabled`.
Analytics is disabled by default in the manifest until the shared policy is applied
(a saved SDK override takes precedence). Analytics persists the runtime override
across sessions. On opt-out, `resetAnalyticsData` clears its local data; this does
not delete data already uploaded. No Firebase calls are added to `:vpn` and no
internal SDK preferences/files are accessed.
[Analytics collection and reset APIs](https://firebase.google.com/docs/reference/android/com/google/firebase/analytics/FirebaseAnalytics).

Envelopes and final `CrashReportPayload` contain exception **types**, source
function/class names, source basename/line, native relative PC/build ID, original
app/core versions, API/ABI, VPN stage, category and event metadata. No arbitrary
exception/panic messages, function arguments, thread names, subscription/config
data, traffic domains/IPs, memory, registers or full tombstones are forwarded.
The default Crashlytics handling of main-process exceptions remains its normal
SDK behavior; the stricter sanitizer described here applies to our added reports.

`event_id`, `run_id` and time are event-specific keys, never exception text, to
keep grouping stable. `source_app_version`, `source_app_version_code` and
`source_core_version` identify the original crash even after an app upgrade.
Synthetic frame class names have a `source.` prefix so the sending build's R8
mapping does not rewrite older frames. R8-obfuscated original frames can be
decoded offline using the archived mapping. Native frames have keys
`native_frame_N = basename|build_id|relative_pc_hex`; Firebase does **not**
automatically symbolize these synthetic non-fatals.

The switch defaults ON and appears inside the last settings item, “Analytics and
crashes”. Analytics collection is disabled at runtime; Crashlytics' full
automatic-upload opt-out applies from the next launch. Sent events cannot be
recalled and local Crashlytics caching is possible.
[Firebase collection/nonfatal behavior](https://firebase.google.com/docs/crashlytics/customize-crash-reports?platform=android).

## Builds and exact symbols

`-PfirebaseEnabled=false` explicitly selects `app/src/noFirebase` even when a
configuration file exists. This build contains no Firebase sink/SDK and does not
capture, schedule or display reporting settings. The normal build selects
`app/src/firebase` only if configuration is present (or explicitly enabled).

Go is built without early `-s -w` stripping or an empty build ID. `-B gobuildid`
retains a GNU build ID derived from the Go build ID. CMake retains libbridge DWARF
and a GNU build ID. `assembleGoJniLibs` creates **paired**, verified artifacts:

```
core/build/generatedJniLibs/
  <abi>/libclash.so                 # stripped packaging copy
  symbols/<abi>/libclash.so.debug   # exact unstripped original
  symbols-manifest.json             # v2, build IDs, SHA-256 of both
```

Core cache keys/assets use `libclash-v2-<go_hash>`; release tags and desktop
sidecar names/hash contract are unchanged. Producer and consumer verify pairs.
Changing the symbol build recipe incompatibly requires a cache format bump.
CI validates and rejects Go fault hooks before publishing a core cache.

After building an APK, archive its **actual** matching symbols, without rebuilding:

```sh
python scripts/native_symbols.py archive \
  --apk-dir app/build/outputs/apk/directOpen/release \
  --mapping app/build/outputs/mapping/directOpenRelease/mapping.txt \
  --version vX.Y.Z --commit COMMIT_SHA \
  --output app/build/outputs/symbols/CheezyClash-vX.Y.Z-symbols.zip
```

The command checks all three ABIs and both native libraries against the packaged
ELF build IDs, rejects DWARF in APKs, and archives originals, APK checksums,
variant version metadata and R8 mapping when generated. Current open release
minification is disabled: the manifest explicitly records `not-generated` for
its mapping. The release workflow attaches this archive to the versioned GitHub
Release (not just an expiring Actions artifact). Keep old release assets.
Private-overlay release pipelines should run the same command for their own APKs
and mapping; never reuse the open app's mapping.

Offline symbolication with the NDK LLVM bin directory:

```sh
python scripts/native_symbols.py symbolize \
  --archive CheezyClash-vX.Y.Z-symbols.zip --abi arm64-v8a \
  --build-id HEX_BUILD_ID --pc HEX_RELATIVE_PC \
  --llvm /path/to/android-sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/linux-x86_64/bin
```

Use `windows-x86_64/bin` on Windows. Source paths may be trimpath'd. No symbol
archive can reconstruct symbols for an unrelated build ID.

## Automated checks

```sh
cd core/src/main/golang
go test ./native/crashoutput ./native/tunnel
# from repository root:
./gradlew :app:testDirectOpenDebugUnitTest
./gradlew :app:testDirectOpenDebugUnitTest -PfirebaseEnabled=false
./gradlew :app:assembleDirectOpenRelease -PfirebaseEnabled=false
```

Go subprocess checks exercise uncaught panic/runtime fatal, original FD closure,
disable and preservation of stderr. JVM tests cover safe parsers, secret-bearing
fixtures, source-version preservation, source merging/late records/deduplication,
policy epochs, queue bounds/TTL, corrupt input, SDK payload/grouping, concurrent
importers and a lock held by a separate OS process. Instrumentation includes
policy/job scheduling; run on a **test install**, as toggling OFF intentionally
deletes pending diagnostics.

## Destructive device acceptance (not a production command)

Use a dedicated debug install. These commands deliberately terminate `:vpn` or
cause an ANR and can interrupt connectivity. Go fault hooks require:

```sh
./gradlew :app:assembleDirectOpenDebug -PcrashTestHooks=true
adb install -r app/build/outputs/apk/directOpen/debug/app-direct-open-arm64-v8a-debug.apk
adb shell am broadcast --receiver-foreground \
  -n com.cheezy.freedom.clash.debug/com.cheezy.freedom.diagnostics.CrashTestReceiver \
  --es kind jvm
```

Check the generated APK filename before installing. Substitute kind `go`,
`go-fatal`, `abort`, `segfault` or `anr`. Receiver and JNI test implementation
exist only in debug, protected by the shell's DUMP permission. The Go export
exists only with the explicit build tag. Release/benchmark task graphs reject
that flag; release verification also rejects cached fault-enabled binaries.
For symbolication of debug Go fault builds use `archive --allow-test-hooks`.

After a crash, test OS-scheduled background delivery without opening Activity:

```sh
adb shell cmd jobscheduler run -f com.cheezy.freedom.clash.debug 4408065
adb shell dumpsys jobscheduler
```

Job `4408065` is the persisted safety job; `4408066` is the coalesced one-shot.
Use an existing scheduled ID. Do not force-stop/restart main just to flush
Crashlytics. Verify at its next normal launch that the console report has the
correct category, source version and frames. `run-as` can inspect private
sanitized queue/handled markers for a debug install; **never publish raw dumps**.

Release gate (requires physical/emulated devices and Firebase Console access):

- API 28/29: JVM and Go evidence captured; unsupported/unconfirmed native exit
  not mislabeled. API 30: distinguish actual crash/ANR from normal/system kills.
- Pixel 7 API 36+: JVM, Go, abort/segfault and system ANR while VPN is active,
  UI closed/frozen and network absent. Verify recovery/import with UI still closed.
- One Go panic plus tombstone => one own event; late records do not resend.
- ON/OFF/ON with a live VPN; no revoked-period imports after re-enable. OFF jobs
  cancelled and queue removed; next-launch SDK behavior matches documented limit.
- At least one real JVM, Go and native report visible in Firebase, plus successful
  native PC symbolication using that exact build's archived symbols.
- Start/stop, reload, warm-up, network changes and concurrent teardown unchanged;
  collector must not delay tunnel shutdown or start a tunnel from a job.
- Verify release APK has no `CrashTestReceiver`, test JNI or `debugCrash` export.

Do not mark the device/console gate complete based only on local unit tests or
`recordException` returning.
