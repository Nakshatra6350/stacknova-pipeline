package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ctx = context.Background()

func connect() *pgx.Conn {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://demo@localhost:55432/names?sslmode=disable"
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

// 23505 is Postgres saying "the unique index already has this".
func isTaken(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func errText(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		return pg.Message
	}
	return err.Error()
}

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

// plan returns a query's scan and the pages it touched, from EXPLAIN.
func plan(c *pgx.Conn, sql string, args ...any) string {
	rows, err := c.Query(ctx, "EXPLAIN (ANALYZE, BUFFERS) "+sql, args...)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()
	var node, buffers string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			log.Fatal(err)
		}
		t := strings.TrimSpace(line)
		t = strings.TrimSpace(strings.TrimPrefix(t, "->"))
		if node == "" && strings.Contains(t, " Scan") {
			node = strings.SplitN(t, "  (", 2)[0]
		}
		if buffers == "" && strings.HasPrefix(t, "Buffers:") {
			buffers = t
		}
	}
	return fmt.Sprintf("%s | %s", node, buffers)
}
