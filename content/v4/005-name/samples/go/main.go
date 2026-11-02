// "Username taken" in a millisecond (look v4 #5): how one name is found among
// millions, the one word that breaks it, what a Bloom filter really buys, and
// why the green tick is only a hint.
//
//	go run . -mode=load       // 10 million names and the unique index
//	go run . -mode=scale      // one check, by table size, with and without it
//	go run . -mode=tree       // the index's real shape, one real route through
//	go run . -mode=traps      // queries that quietly stop using the index
//	go run . -mode=lower      // an index on lower(): plain and CONCURRENTLY
//	go run . -mode=hash       // can a hash index replace the B-tree?
//	go run . -mode=writes     // what each index costs an insert
//	go run . -mode=cold       // a check straight after a restart
//	go run . -mode=case       // Alice and alice: which rule stops them
//	go run . -mode=dupes      // the unique index fails: duplicates exist
//	go run . -mode=race       // the green tick: two signups, one name
//	go run . -mode=deleted    // a deleted user keeps the name, or doesn't
//	go run . -mode=suggest    // "try one of these": one query, not five
//	go run . -mode=partition  // what partitioning allows a unique index
//	go run . -mode=bloom      // false positives: predicted against measured
//	go run . -mode=overfill   // a filter loaded past its size
//	go run . -mode=billion    // a real billion names in 1.2 GB
//	go run . -mode=saves      // how many database checks a filter avoids
//	go run . -mode=stale      // two servers, a filter each
//	go run . -mode=forget     // why a Bloom filter can't forget a name
//	go run . -mode=memory     // every name in a Go map, against the filter
//	go run . -mode=unicode    // tiny capitals and lookalike letters
//	go run . -mode=takeover   // Spotify's bug, in miniature
//	go run . -mode=scrape     // the check as an open door, and a limiter
//
// Needs a Postgres URL in DATABASE_URL (default: localhost:55432/names).
package main

import (
	"flag"
	"log"
)

func main() {
	mode := flag.String("mode", "scale", "which test")
	tries := flag.Int("tries", 10, "tries per slow query")
	flag.Parse()
	c := connect()
	defer c.Close(ctx)
	switch *mode {
	case "load":
		load(c)
	case "scale":
		scale(c)
	case "tree":
		tree(c)
	case "traps":
		traps(c, *tries)
	case "lower":
		lowerFix(c)
	case "hash":
		hashIndex(c)
	case "writes":
		writes(c)
	case "cold":
		cold(c)
	case "case":
		caseRules(c)
	case "dupes":
		dupes(c)
	case "race":
		race(c)
	case "deleted":
		deleted(c)
	case "suggest":
		suggest(c)
	case "partition":
		partition(c)
	case "bloom":
		bloomRates()
	case "overfill":
		overfill()
	case "billion":
		billion()
	case "saves":
		saves(c)
	case "stale":
		stale(c)
	case "forget":
		forget(c)
	case "memory":
		memory()
	case "unicode":
		unicodeTricks(c)
	case "takeover":
		takeover(c)
	case "scrape":
		scrape()
	default:
		log.Fatalf("no mode %q", *mode)
	}
}
