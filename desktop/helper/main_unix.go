//go:build !windows

package main

import "log"

func main() {
	if err := runHTTP(); err != nil {
		log.Fatal(err)
	}
}
