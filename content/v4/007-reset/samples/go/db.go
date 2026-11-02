package main

import (
	"context"
	"errors"
	"log"
	"os"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

var ctx = context.Background()

func connect() *pgx.Conn {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://demo@localhost:55432/reset?sslmode=disable"
	}
	c, err := pgx.Connect(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	return c
}

func run(c *pgx.Conn, sql string, args ...any) {
	if _, err := c.Exec(ctx, sql, args...); err != nil {
		log.Fatalf("%v\n%s", err, sql)
	}
}

func one[T any](c *pgx.Conn, sql string, args ...any) T {
	var v T
	if err := c.QueryRow(ctx, sql, args...).Scan(&v); err != nil {
		log.Fatalf("%v\n%s", err, sql)
	}
	return v
}

func noRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// timed returns the average and p99, in milliseconds, of n calls.
func timed(n int, f func(i int)) (avg, p99 float64) {
	all := make([]float64, n)
	for i := range all {
		start := time.Now()
		f(i)
		all[i] = float64(time.Since(start).Microseconds()) / 1000
		avg += all[i]
	}
	sort.Float64s(all)
	return avg / float64(n), all[(n*99)/100]
}
