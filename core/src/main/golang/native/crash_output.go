package main

//#include "bridge.h"
import "C"

import (
	"cheezy/native/crashoutput"
	"os"
	"syscall"
)

//export configureCrashOutput
func configureCrashOutput(fd C.int) C.int {
	if fd < 0 {
		if crashoutput.Configure(nil) != nil {
			return 0
		}
		return 1
	}
	// Never wrap the borrowed Java FD in an os.File: its finalizer could close it.
	duplicate, err := syscall.Dup(int(fd))
	if err != nil {
		return 0
	}
	syscall.CloseOnExec(duplicate)
	f := os.NewFile(uintptr(duplicate), "go-crash-output")
	defer f.Close()
	if crashoutput.Configure(f) != nil {
		return 0
	}
	return 1
}
