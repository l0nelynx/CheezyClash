package main

import (
	"log"
	"os"

	"cheezy/helper/internal/machelper"
)

func main() {
	if err := machelper.Run(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
