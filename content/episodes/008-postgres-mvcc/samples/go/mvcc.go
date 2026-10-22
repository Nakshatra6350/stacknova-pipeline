// Package mvcc shows Postgres MVCC from Go with pgx: a read that does not wait for a write, the
// hidden columns of a row version, the sessions that hold back VACUUM, and the transaction ID age
// to alert on. Episode 008 — "How Postgres never blocks: MVCC".
package mvcc

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReadWhileWriting updates a balance in one transaction and, before it commits, reads the same
// row on another connection. The read does not wait: it sees the old version (100). After the
// commit, a new statement takes a new snapshot and sees 70. Shown in segment s03.
func ReadWhileWriting(ctx context.Context, pool *pgxpool.Pool) (before, after int, err error) {
	w, err := pool.Begin(ctx) // the writer
	if err != nil {
		return 0, 0, err
	}
	defer func() { _ = w.Rollback(ctx) }() // a no-op once committed
	if _, err = w.Exec(ctx, `UPDATE accounts SET balance = 70 WHERE id = 1`); err != nil {
		return 0, 0, err
	}
	q := `SELECT balance FROM accounts WHERE id = 1`
	if err = pool.QueryRow(ctx, q).Scan(&before); err != nil { // 100, no wait
		return 0, 0, err
	}
	if err = w.Commit(ctx); err != nil {
		return 0, 0, err
	}
	err = pool.QueryRow(ctx, q).Scan(&after) // 70
	return before, after, err
}

// Version returns the hidden columns of the version of row 1 this statement sees: the
// transaction that wrote it (xmin), the one that replaced or deleted it (xmax, 0 if none) and
// where it sits on disk (ctid). After an UPDATE, xmin and ctid change. Shown in segment s04.
func Version(ctx context.Context, pool *pgxpool.Pool) (xmin, xmax, ctid string, err error) {
	q := `SELECT xmin::text, xmax::text, ctid::text
	      FROM accounts WHERE id = 1`
	err = pool.QueryRow(ctx, q).Scan(&xmin, &xmax, &ctid)
	return xmin, xmax, ctid, err
}

// Idle is a session that began a transaction and went quiet.
type Idle struct {
	PID     int32
	Seconds int64 // how long its transaction has been open
}

// IdleInTransaction lists sessions idle inside a transaction: their snapshots keep VACUUM from
// removing dead versions. idle_in_transaction_session_timeout ends them automatically. Shown in
// segment s05.
func IdleInTransaction(ctx context.Context, pool *pgxpool.Pool) ([]Idle, error) {
	rows, err := pool.Query(ctx, `
	    SELECT pid,
	           EXTRACT(EPOCH FROM now() - xact_start)::bigint
	    FROM pg_stat_activity
	    WHERE state = 'idle in transaction'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var idle []Idle
	for rows.Next() {
		var s Idle
		if err := rows.Scan(&s.PID, &s.Seconds); err != nil {
			return nil, err
		}
		idle = append(idle, s)
	}
	return idle, rows.Err()
}

// Overdue names the databases whose oldest unfrozen transaction ID is more than limit IDs old.
// Wraparound protection stops writes about two billion IDs out; alert far earlier, say at a
// billion. Shown in segment s06.
func Overdue(ctx context.Context, pool *pgxpool.Pool, limit int64) ([]string, error) {
	rows, err := pool.Query(ctx,
		`SELECT datname, age(datfrozenxid) FROM pg_database`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var overdue []string
	for rows.Next() {
		var name string
		var age int64
		if err := rows.Scan(&name, &age); err != nil {
			return nil, err
		}
		if age > limit { // say, a billion: half way
			overdue = append(overdue, name)
		}
	}
	return overdue, rows.Err()
}
