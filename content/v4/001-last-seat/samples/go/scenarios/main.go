// The last seat in production (look v4 pilot, the free guide's scenarios):
//
//	go run ./scenarios -mode=best-seat-for-update  // "give me the best free seat": everyone queues on one row
//	go run ./scenarios -mode=best-seat-skip-locked // the same with SKIP LOCKED: each request takes another seat
//	go run ./scenarios -mode=pair-any-order        // two people book the same two seats in opposite order
//	go run ./scenarios -mode=pair-sorted           // the same, both locking in seat order
//
// Needs a Postgres URL in DATABASE_URL.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"slices"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	bestFree = `SELECT id FROM seats WHERE holder IS NULL
		ORDER BY id LIMIT 1 FOR UPDATE`
	bestFreeSkip = `SELECT id FROM seats WHERE holder IS NULL
		ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`
)

// bestSeat gives the user the lowest-numbered free seat, or 0 when it finds none. With FOR UPDATE
// every request queues on the same row; SKIP LOCKED steps over rows other requests hold.
func bestSeat(ctx context.Context, db *pgxpool.Pool, query, user string, work time.Duration) (int, error) {
	seat := 0
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, query).Scan(&seat)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // no free seat found
		}
		if err != nil {
			return err
		}
		time.Sleep(work) // the rest of the request, while it holds the seat: a price check, say
		_, err = tx.Exec(ctx, `UPDATE seats SET holder = $1 WHERE id = $2`, user, seat)
		return err
	})
	if err != nil {
		return 0, err
	}
	return seat, nil
}

// bookPair books two seats together, locking them one at a time. Two requests that lock the same
// seats in opposite order each wait for the other: a deadlock. Postgres finds it (after
// deadlock_timeout, 1 s by default) and cancels one of them with SQLSTATE 40P01.
func bookPair(ctx context.Context, db *pgxpool.Pool, user string, seats []int, sorted bool, work time.Duration) (bool, error) {
	if sorted {
		seats = slices.Sorted(slices.Values(seats)) // the fix: everyone locks in the same order
	}
	ok := false
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		for _, seat := range seats {
			var holder *string
			err := tx.QueryRow(ctx, `SELECT holder FROM seats WHERE id = $1 FOR UPDATE`, seat).Scan(&holder)
			if err != nil || holder != nil {
				return err
			}
			time.Sleep(work)
		}
		_, err := tx.Exec(ctx, `UPDATE seats SET holder = $1 WHERE id = ANY($2)`, user, seats)
		ok = err == nil
		return err
	})
	return ok, err
}

func main() {
	mode := flag.String("mode", "best-seat-for-update", "best-seat-for-update, best-seat-skip-locked, pair-any-order or pair-sorted")
	n := flag.Int("n", 100, "people and seats (best-seat), or pairs of seats (pair modes)")
	work := flag.Duration("work", 10*time.Millisecond, "how long a request holds its locks before writing")
	flag.Parse()

	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	cfg.MaxConns = 50
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	seats := *n
	if *mode == "pair-any-order" || *mode == "pair-sorted" {
		seats = 2 * *n
	}
	for _, sql := range []string{
		`DROP TABLE IF EXISTS seats`,
		`CREATE TABLE seats (id int PRIMARY KEY, holder text)`,
		fmt.Sprintf(`INSERT INTO seats (id) SELECT g FROM generate_series(1, %d) g`, seats),
	} {
		if _, err := db.Exec(ctx, sql); err != nil {
			log.Fatal(err)
		}
	}
	// open every connection first, so the time below measures locking, not connecting
	conns := make([]*pgxpool.Conn, 0, cfg.MaxConns)
	for range cfg.MaxConns {
		c, err := db.Acquire(ctx)
		if err != nil {
			log.Fatal(err)
		}
		conns = append(conns, c)
	}
	for _, c := range conns {
		c.Release()
	}

	began := time.Now()
	switch *mode {
	case "best-seat-for-update", "best-seat-skip-locked":
		query := bestFree
		if *mode == "best-seat-skip-locked" {
			query = bestFreeSkip
		}
		var mu sync.Mutex
		told := map[int]int{} // seat -> how many people were told they got it
		noSeat := 0
		start := make(chan struct{})
		var wg sync.WaitGroup
		for i := range *n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start // everyone taps "Best available" at the same moment
				seat, err := bestSeat(ctx, db, query, fmt.Sprintf("user%d", i), *work)
				if err != nil {
					log.Fatal(err)
				}
				mu.Lock()
				defer mu.Unlock()
				if seat == 0 {
					noSeat++
				} else {
					told[seat]++
				}
			}()
		}
		close(start)
		wg.Wait()
		twice := 0
		for _, c := range told {
			if c > 1 {
				twice++
			}
		}
		var free int
		if err := db.QueryRow(ctx, `SELECT count(*) FROM seats WHERE holder IS NULL`).Scan(&free); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%s: %d people, %d seats: %d got a seat, %d sold twice, %d told no seat, %d seats left free (%d ms)\n",
			*mode, *n, seats, len(told), twice, noSeat, free, time.Since(began).Milliseconds())

	case "pair-any-order", "pair-sorted":
		deadlocks, twice := 0, 0
		for p := range *n {
			a, b := 2*p+1, 2*p+2
			orders := [][]int{{a, b}, {b, a}} // Ana taps a then b; Bo taps b then a
			got := make([]bool, 2)
			var mu sync.Mutex
			start := make(chan struct{})
			var wg sync.WaitGroup
			for i, user := range []string{"ana", "bo"} {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-start
					ok, err := bookPair(ctx, db, user, orders[i], *mode == "pair-sorted", *work)
					var pgErr *pgconn.PgError
					if errors.As(err, &pgErr) && pgErr.Code == "40P01" {
						mu.Lock()
						deadlocks++
						mu.Unlock()
						return
					}
					if err != nil {
						log.Fatal(err)
					}
					got[i] = ok
				}()
			}
			close(start)
			wg.Wait()
			if got[0] && got[1] {
				twice++
			}
		}
		fmt.Printf("%s: %d pairs, %d deadlocks, %d pairs sold twice (%d ms)\n",
			*mode, *n, deadlocks, twice, time.Since(began).Milliseconds())

	default:
		log.Fatalf("unknown mode %q", *mode)
	}
}
