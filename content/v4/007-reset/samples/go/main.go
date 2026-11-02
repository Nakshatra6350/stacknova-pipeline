// The reset link that only works once (look v4 #7): a stolen table, two clicks at
// once, the scanner that clicks first, and the ways a reset link gets away.
//
//	go run . -mode=leak        // the table leaks: plain tokens against hashes
//	go run . -mode=hashes      // SHA-256, or bcrypt? speed, and finding the row
//	go run . -mode=once        // two clicks at the same moment
//	go run . -mode=scanner     // a mail scanner opens the link first
//	go run . -mode=expiry      // how long a link lives
//	go run . -mode=oldlinks    // three requests, three live links
//	go run . -mode=sessions    // the attacker stays logged in
//	go run . -mode=whose       // the form says whose account it is
//	go run . -mode=weak        // a token seeded with the time
//	go run . -mode=guess       // a 6-digit code, with and without a limit
//	go run . -mode=guesslong   // how long 256 bits would take
//	go run . -mode=host        // the link built from the Host header
//	go run . -mode=twoemails   // GitLab's bug, in miniature
//	go run . -mode=tell        // "no such account", and the stopwatch
//	go run . -mode=bomb        // 1,000 reset emails to one person
//	go run . -mode=logs        // the token in the access log
//	go run . -mode=signed      // a link with no table at all
//
// Needs a Postgres URL in DATABASE_URL (default: localhost:55432/reset).
package main

import (
	"flag"
	"log"
)

func main() {
	mode := flag.String("mode", "leak", "which test")
	flag.Parse()
	c := connect()
	defer c.Close(ctx)
	switch *mode {
	case "leak":
		leak(c)
	case "hashes":
		hashes(c)
	case "once":
		once(c)
	case "scanner":
		scanner(c)
	case "expiry":
		expiry(c)
	case "oldlinks":
		oldLinks(c)
	case "sessions":
		sessionsTest(c)
	case "whose":
		whose(c)
	case "weak":
		weak()
	case "guess":
		guess(c)
	case "guesslong":
		guessLong()
	case "host":
		host(c)
	case "twoemails":
		twoEmails(c)
	case "tell":
		tell(c)
	case "bomb":
		bomb(c)
	case "logs":
		logs(c)
	case "signed":
		signed(c)
	default:
		log.Fatalf("no mode %q", *mode)
	}
}
