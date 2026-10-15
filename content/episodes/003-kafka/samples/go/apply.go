package ledger

import (
	"context"
	"database/sql"

	"github.com/twmb/franz-go/pkg/kgo"
)

// Table, in the ledger's own database (PostgreSQL):
//
//	CREATE TABLE consumer_offsets (
//	    consumer    text   NOT NULL,
//	    topic       text   NOT NULL,
//	    part        int    NOT NULL,
//	    next_offset bigint NOT NULL DEFAULT 0,
//	    PRIMARY KEY (consumer, topic, part)
//	);
//
// One row per partition this consumer reads; the key starts with the consumer's name, so every
// consumer keeps its own record.

// ApplyOnce applies a record exactly once in effect: the ledger entry and the partition's next
// offset are written in one transaction, and a record below the stored offset is a replay, so it
// is skipped. Every record already has a unique address: topic, partition, offset.
// Shown in segment s06.
func ApplyOnce(ctx context.Context, db *sql.DB, r *kgo.Record) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() // a no-op once committed
	if fresh, err := claim(ctx, tx, r); err != nil || !fresh {
		return err // replayed: applied before, skip it
	}
	if err := addEntry(ctx, tx, r.Value); err != nil {
		return err
	}
	return tx.Commit() // effect and offset, together
}

// claim moves this partition's stored offset past r. It reports false when r is below the stored
// offset, which means r was applied before.
func claim(ctx context.Context, tx *sql.Tx, r *kgo.Record) (bool, error) {
	res, err := tx.ExecContext(ctx, `
		UPDATE consumer_offsets SET next_offset = $4
		WHERE consumer = $1 AND topic = $2 AND part = $3 AND next_offset <= $5`,
		"ledger", r.Topic, r.Partition, r.Offset+1, r.Offset)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func addEntry(ctx context.Context, tx *sql.Tx, event []byte) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO ledger (event, entry) VALUES ($1::jsonb, 'paid')`, string(event))
	return err
}
