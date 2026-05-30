package main

// Blank import registers all Mihomo plugins (inbounds, outbounds, providers,
// dns-providers, rule-providers, obfuscators). Analogous to cfa/native/all from CMFA.
//
// In CMFA, this import is in src/foss/golang/main.go (separate foss Go module),
// but we have a single cheezy module — so the import is right next to native/main.go.

import (
	_ "cheezy/native/all"
)
