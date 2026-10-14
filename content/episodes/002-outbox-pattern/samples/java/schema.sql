-- Tables used by the Java samples of episode 002 (PostgreSQL 18).

CREATE TABLE payments (
  id     bigint PRIMARY KEY,
  status text   NOT NULL
);

-- The outbox: one row per event, written in the same transaction as the change it describes.
CREATE TABLE outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic        text        NOT NULL,
  payment_id   bigint      NOT NULL,          -- the message key: one payment's events stay in order
  payload      jsonb       NOT NULL,          -- carries its own event_id
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz                    -- NULL until the relay has sent it
);
CREATE INDEX outbox_unpublished ON outbox (id) WHERE published_at IS NULL;

-- In each consumer's own database: the events it has already applied. The key is the pair, so
-- every consumer keeps its own record.
CREATE TABLE processed_events (
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE ledger (
  payment_id bigint NOT NULL,
  entry      text   NOT NULL
);
