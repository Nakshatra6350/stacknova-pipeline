// Package mvcc shows Postgres MVCC from Go with pgx: a read that does not wait for a write, the
// hidden columns of a row version, the sessions that hold back VACUUM, the transaction ID age to
// alert on, and three production habits: retrying a write that lost a race, measuring HOT
// updates, and a pool that ends forgotten transactions. Episode 008 — "How Postgres never blocks".
package mvcc

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrInsufficient is returned when an account holds less than the amount asked for.
var ErrInsufficient = errors.New("insufficient balance")

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

// Withdraw takes amount from an account at repeatable read. Two writers on the same row take
// turns: the second waits for the first, and when the first commits, Postgres stops the second
// with SQLSTATE 40001 ("could not serialize access"). Nothing was written, so the whole
// transaction is safe to run again: Withdraw retries it a few times. Shown in segment s07.
func Withdraw(ctx context.Context, pool *pgxpool.Pool, id, amount int) error {
	opts := pgx.TxOptions{IsoLevel: pgx.RepeatableRead}
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = pgx.BeginTxFunc(ctx, pool, opts, func(tx pgx.Tx) error {
			var balance int
			q := `SELECT balance FROM accounts WHERE id = $1`
			if err := tx.QueryRow(ctx, q, id).Scan(&balance); err != nil {
				return err
			}
			if balance < amount {
				return ErrInsufficient
			}
			_, err := tx.Exec(ctx, `UPDATE accounts SET balance = $1 WHERE id = $2`, balance-amount, id)
			return err
		})
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "40001" {
			return err // nil, or a failure a retry will not fix
		}
	}
	return err
}

// HotShare returns the percentage of a table's updates that were HOT (heap-only tuples: the new
// version stayed on the same page and no index got a new entry). A low share on a busy table is
// the sign to leave room on each page: ALTER TABLE accounts SET (fillfactor = 90), which applies
// to pages written from then on. Shown in segment s07.
func HotShare(ctx context.Context, pool *pgxpool.Pool, table string) (float64, error) {
	var share float64
	err := pool.QueryRow(ctx, `
	    SELECT coalesce(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 0)::float8
	    FROM pg_stat_user_tables
	    WHERE relname = $1`, table).Scan(&share)
	return share, err
}

// NewPool opens a pool whose sessions end any transaction left idle for a minute and any
// statement running for more than 30 seconds, so a forgotten transaction cannot hold back VACUUM
// for hours. Shown in segment s07.
func NewPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	params := cfg.ConnConfig.RuntimeParams
	params["idle_in_transaction_session_timeout"] = "60000" // milliseconds
	params["statement_timeout"] = "30000"
	return pgxpool.NewWithConfig(ctx, cfg)
}
