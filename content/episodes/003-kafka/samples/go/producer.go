// Package ledger shows a Kafka producer and an at-least-once consumer with franz-go.
// Episode 003 — "Inside Kafka".
package ledger

import (
	"context"

	"github.com/twmb/franz-go/pkg/kgo"
)

// Publish appends one event to the payments.paid topic. The key picks the partition, so every
// event of one payment lands in the same partition, in order. ProduceSync waits for the
// broker's acknowledgement. Shown in segment s03.
func Publish(ctx context.Context, cl *kgo.Client, paymentID string, event []byte) error {
	rec := &kgo.Record{
		Topic: "payments.paid",
		Key:   []byte(paymentID), // same key, same partition
		Value: event,
	}
	if err := cl.ProduceSync(ctx, rec).FirstErr(); err != nil {
		return err // no ack: it may or may not be in the log
	}
	return nil
}
