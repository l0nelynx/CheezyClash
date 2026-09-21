package main

import (
	"log"
	"os"

	"cheezy/helper/internal/linuxhelper"
)

func main() {
	if err := linuxhelper.Run(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
