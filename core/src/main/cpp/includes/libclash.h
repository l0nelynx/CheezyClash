/*
 * Minimal header for libclash.so (mihomo built as the CMFA variant).
 *
 * Contains exactly the symbols that the JNI wrapper (main.c) calls on the Go side,
 * plus function pointers through which Go triggers callbacks in the JVM.
 *
 * Signatures are cross-referenced with CMFA Go sources (//export foo) and confirmed
 * with symbols from prebuilt libclash.so via llvm-nm -D.
 *
 * This file is a manual replacement for what cgo generates during
 * `go build -buildmode=c-shared`. When we switch to building libclash.so from
 * source, it will be replaced by an automatically generated header.
 */
#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef const char *c_string;

/* ---- Function pointers that Go calls in our code (JNI side). ---- */
extern void (*mark_socket_func)(void *tun_interface, int fd);
extern int  (*query_socket_uid_func)(void *tun_interface, int protocol, const char *source, const char *target);
extern void (*complete_func)(void *completable, const char *exception);
extern void (*fetch_report_func)(void *fetch_callback, const char *status_json);
extern void (*fetch_complete_func)(void *fetch_callback, const char *error);
extern int  (*logcat_received_func)(void *logcat_interface, const char *payload);
extern void (*release_object_func)(void *obj);
extern int  (*open_content_func)(const char *url, char *error, int error_length);

/* ---- Go functions exported by libclash.so. ---- */
extern void coreInit(c_string home, c_string versionName, c_string gitVersion, int sdkVersion);
extern void reset(void);
extern void forceGc(void);
extern void suspend(int suspended);

extern char *queryTunnelState(void);
extern void  queryNow(uint64_t *upload, uint64_t *download);
extern void  queryTotal(uint64_t *upload, uint64_t *download);

extern void notifyDnsChanged(c_string dnsList);
extern void notifyInstalledAppsChanged(c_string uids);
extern void notifyTimeZoneChanged(c_string name, int offset);

extern int  startTun(int fd, c_string stack, c_string gateway, c_string portal, c_string dns, void *callback);
extern void stopTun(void);

extern char *startHttp(c_string listenAt);
extern void  stopHttp(void);

extern char *queryGroupNames(int excludeNotSelectable);
extern char *queryGroup(c_string name, c_string sortMode);

extern void healthCheck(void *completable, c_string name);
extern void healthCheckAll(void);

extern int patchSelector(c_string selector, c_string name);

extern void  load(void *completable, c_string path);
extern void  fetchAndValid(void *callback, c_string path, c_string url, int force);

extern char *queryProviders(void);
extern void  updateProvider(void *completable, c_string pType, c_string name);

extern char *readOverride(int slot);
extern void  writeOverride(int slot, c_string content);
extern void  clearOverride(int slot);

extern char *queryConfiguration(void);

extern void subscribeLogcat(void *remote);

/* Returns the mihomo version compiled into libclash.so via
 * -ldflags -X main.mihomoVersion during Go build (see core/build.gradle.kts).
 * The caller is responsible for freeing the returned string via free(). */
extern char *getMihomoVersion(void);

#ifdef __cplusplus
}
#endif
