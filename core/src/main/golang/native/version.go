package main

import "C"

// mihomoVersion is filled via -ldflags "-X 'main.mihomoVersion=...'"
// in core/build.gradle.kts during libclash.so build. The value is a pseudo-version
// or git-ref for github.com/metacubex/mihomo from go.mod at build time.
//
// If the variable was not injected by the linker (e.g., local
// `go build` without flags), it remains "unknown".
var mihomoVersion = "unknown"

//export getMihomoVersion
func getMihomoVersion() *C.char {
	return C.CString(mihomoVersion)
}
