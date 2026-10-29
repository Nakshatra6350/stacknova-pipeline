// The last seat (look v4 pilot): two people book the same seat at the same moment.
//
//	go run . -mode=check-then-write   // the usual code: read the seat, then write it
//	go run . -mode=conditional        // one UPDATE that only succeeds while the seat is free
//
// Each run sells N seats; every seat gets two booking requests that start together, like two
// people tapping "Book" on the last seat. A seat "sold twice" is one where both requests were
// told they got it. Needs a Postgres URL in DATABASE_URL.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// bookCheckThenWrite is the usual first version: it reads the seat, and writes it if it is free.
// Between the read and the write, the other request can read the same "free" seat.
func bookCheckThenWrite(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
	var holder *string
	if err := db.QueryRow(ctx, `SELECT holder FROM seats WHERE id = $1`, seat).Scan(&holder); err != nil {
		return false, err
	}
	if holder != nil {
		return false, nil // already taken
	}
	_, err := db.Exec(ctx, `UPDATE seats SET holder = $1 WHERE id = $2`, user, seat)
	return err == nil, err
}

// bookConditional checks and writes in one statement. The first UPDATE locks the row; the second
// waits, then re-checks "holder IS NULL" on the row the first one wrote, matches nothing, and
// reports 0 rows: that request lost the seat.
func bookConditional(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
	tag, err := db.Exec(ctx,
		`UPDATE seats SET holder = $1 WHERE id = $2 AND holder IS NULL`, user, seat)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func main() {
	mode := flag.String("mode", "check-then-write", "check-then-write or conditional")
	seats := flag.Int("seats", 1000, "how many seats to sell")
	flag.Parse()
	book := bookCheckThenWrite
	if *mode == "conditional" {
		book = bookConditional
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	for _, sql := range []string{
		`DROP TABLE IF EXISTS seats`,
		`CREATE TABLE seats (id int PRIMARY KEY, holder text)`,
		fmt.Sprintf(`INSERT INTO seats SELECT g, NULL FROM generate_series(1, %d) g`, *seats),
	} {
		if _, err := db.Exec(ctx, sql); err != nil {
			log.Fatal(err)
		}
	}

	soldTwice := 0
	for seat := 1; seat <= *seats; seat++ {
		start := make(chan struct{})
		var wg sync.WaitGroup
		got := make([]bool, 2)
		for i, user := range []string{"ana", "bo"} {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start // both requests leave at the same moment
				ok, err := book(ctx, db, seat, user)
				if err != nil {
					log.Fatal(err)
				}
				got[i] = ok
			}()
		}
		close(start)
		wg.Wait()
		if got[0] && got[1] {
			soldTwice++
		}
	}
	fmt.Printf("%s: %d seats, %d sold twice\n", *mode, *seats, soldTwice)
}
