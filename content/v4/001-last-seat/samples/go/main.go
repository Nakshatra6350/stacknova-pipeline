// The last seat (look v4 pilot): two people book the same seat at the same moment.
//
//	go run . -mode=check-then-write    // the usual code: read the seat, then write it
//	go run . -mode=tx-check-then-write // the same, inside a transaction: still broken
//	go run . -mode=conditional         // fix 1: one UPDATE that only succeeds while the seat is free
//	go run . -mode=version             // fix 1b: optimistic locking with a version number
//	go run . -mode=for-update          // fix 2: lock the row while you read it
//	go run . -mode=unique              // fix 3: a unique constraint says no to the second booking
//	go run . -mode=repeatable-read     // REPEATABLE READ turns the race into an error
//	go run . -mode=serializable        // and so does SERIALIZABLE
//
// Each run sells N seats; every seat gets two booking requests that start together, like two
// people tapping "Book" on the last seat. A seat "sold twice" is one where both requests were
// told they got it. Needs a Postgres URL in DATABASE_URL.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

// bookVersion is optimistic locking with a version number: read the seat and its version, then
// write only if the version is still the one that was read. The request that lost changes 0 rows.
func bookVersion(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
	var holder *string
	var version int
	err := db.QueryRow(ctx, `SELECT holder, version FROM seats WHERE id = $1`, seat).Scan(&holder, &version)
	if err != nil || holder != nil {
		return false, err
	}
	tag, err := db.Exec(ctx,
		`UPDATE seats SET holder = $1, version = version + 1 WHERE id = $2 AND version = $3`, user, seat, version)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// bookTxCheckThenWrite wraps the usual version in a transaction. At Read Committed (Postgres's
// default) both reads still see a free seat, and the second UPDATE, after waiting for the first,
// still matches "WHERE id = $2": a transaction alone does not stop the race.
func bookTxCheckThenWrite(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
	ok := false
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var holder *string
		if err := tx.QueryRow(ctx, `SELECT holder FROM seats WHERE id = $1`, seat).Scan(&holder); err != nil {
			return err
		}
		if holder != nil {
			return nil
		}
		_, err := tx.Exec(ctx, `UPDATE seats SET holder = $1 WHERE id = $2`, user, seat)
		ok = err == nil
		return err
	})
	return ok, err
}

// bookForUpdate locks the row while it reads it: the second request waits at its SELECT until the
// first commits, then reads the seat the first one took.
func bookForUpdate(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
	ok := false
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var holder *string
		err := tx.QueryRow(ctx, `SELECT holder FROM seats WHERE id = $1 FOR UPDATE`, seat).Scan(&holder)
		if err != nil || holder != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE seats SET holder = $1 WHERE id = $2`, user, seat)
		ok = err == nil
		return err
	})
	return ok, err
}

// bookUnique records each booking as a row in its own table, whose primary key is the seat: the
// second INSERT for a seat fails with a unique violation (SQLSTATE 23505), which means "taken".
func bookUnique(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
	_, err := db.Exec(ctx, `INSERT INTO bookings (seat_id, holder) VALUES ($1, $2)`, seat, user)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return false, nil
	}
	return err == nil, err
}

// bookIsolated runs the usual read-then-write at a stricter isolation level. At REPEATABLE READ and
// SERIALIZABLE, Postgres lets only one of the two commit and fails the other with a serialization
// error (SQLSTATE 40001). A retry would read the seat as taken, so here the error means it is gone.
func bookIsolated(level pgx.TxIsoLevel) func(context.Context, *pgxpool.Pool, int, string) (bool, error) {
	return func(ctx context.Context, db *pgxpool.Pool, seat int, user string) (bool, error) {
		ok := false
		err := pgx.BeginTxFunc(ctx, db, pgx.TxOptions{IsoLevel: level}, func(tx pgx.Tx) error {
			var holder *string
			if err := tx.QueryRow(ctx, `SELECT holder FROM seats WHERE id = $1`, seat).Scan(&holder); err != nil {
				return err
			}
			if holder != nil {
				return nil
			}
			_, err := tx.Exec(ctx, `UPDATE seats SET holder = $1 WHERE id = $2`, user, seat)
			ok = err == nil
			return err
		})
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "40001" {
			return false, nil
		}
		return ok, err
	}
}

func main() {
	mode := flag.String("mode", "check-then-write", "check-then-write, tx-check-then-write, conditional, version, for-update, unique, repeatable-read or serializable")
	seats := flag.Int("seats", 1000, "how many seats to sell")
	flag.Parse()
	modes := map[string]func(context.Context, *pgxpool.Pool, int, string) (bool, error){
		"check-then-write": bookCheckThenWrite, "tx-check-then-write": bookTxCheckThenWrite,
		"conditional": bookConditional, "version": bookVersion, "for-update": bookForUpdate,
		"unique": bookUnique, "repeatable-read": bookIsolated(pgx.RepeatableRead),
		"serializable": bookIsolated(pgx.Serializable),
	}
	book, known := modes[*mode]
	if !known {
		log.Fatalf("unknown mode %q", *mode)
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	for _, sql := range []string{
		`DROP TABLE IF EXISTS seats, bookings`,
		`CREATE TABLE seats (id int PRIMARY KEY, holder text, version int NOT NULL DEFAULT 0)`,
		`CREATE TABLE bookings (seat_id int PRIMARY KEY, holder text NOT NULL)`,
		fmt.Sprintf(`INSERT INTO seats (id) SELECT g FROM generate_series(1, %d) g`, *seats),
	} {
		if _, err := db.Exec(ctx, sql); err != nil {
			log.Fatal(err)
		}
	}

	soldTwice, soldToNobody := 0, 0
	began := time.Now()
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
		if !got[0] && !got[1] {
			soldToNobody++ // a fix that turns everyone away is broken too
		}
	}
	fmt.Printf("%s: %d seats, %d sold twice, %d sold to nobody (%d ms)\n",
		*mode, *seats, soldTwice, soldToNobody, time.Since(began).Milliseconds())
}
