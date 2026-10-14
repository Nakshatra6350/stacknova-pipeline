package ledger

import (
	"context"
	"log"

	"github.com/twmb/franz-go/pkg/kgo"
)

// NewConsumer joins the consumer group "ledger" on payments.paid. Auto-commit is off: the loop
// in Run commits an offset only after the records before it have been applied.
// Shown in segment s05.
func NewConsumer(brokers ...string) (*kgo.Client, error) {
	return kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup("ledger"), // share the partitions
		kgo.ConsumeTopics("payments.paid"),
		kgo.DisableAutoCommit(), // we say when it's done
	)
}

// Run applies records, then commits their offsets: at least once. A crash or a rebalance
// between the two hands the same records to the partition's next owner, so apply must be
// idempotent (episode 002's processed-events table). Shown in segment s05.
func Run(ctx context.Context, cl *kgo.Client, apply func(context.Context, *kgo.Record)) {
	for ctx.Err() == nil {
		fetches := cl.PollFetches(ctx)
		fetches.EachRecord(func(r *kgo.Record) {
			apply(ctx, r) // the effect, idempotent
		})
		if err := cl.CommitUncommittedOffsets(ctx); err != nil {
			log.Printf("commit failed, these come again: %v", err)
		}
	}
}
