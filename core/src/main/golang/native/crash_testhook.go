//go:build crash_test_hooks

package main

import "C"
import "sync"

//export debugCrash
func debugCrash(mode C.int) {
	go func() {
		if mode == 2 {
			var mutex sync.Mutex
			mutex.Unlock()
		}
		panic("DIAGNOSTIC_TEST_PRIVATE_MESSAGE")
	}()
}
