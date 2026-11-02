package main

import (
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The accounts, and their reset tokens: only ever the hash.
const schema = `
DROP TABLE IF EXISTS reset_tokens, sessions, mail, users CASCADE;
CREATE TABLE users (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email    TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
CREATE TABLE reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
CREATE INDEX reset_tokens_user ON reset_tokens (user_id);
CREATE TABLE sessions (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE
);
CREATE TABLE mail (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sent_to TEXT NOT NULL,
  body    TEXT NOT NULL
);`

// Using a token: one statement, so two clicks can't both get through.
const useToken = `UPDATE reset_tokens SET used_at = now()
WHERE token_hash = $1
  AND used_at IS NULL
  AND expires_at > now()
RETURNING user_id`

// A new link cancels the old ones.
const cancelOld = `UPDATE reset_tokens SET used_at = now()
WHERE user_id = $1 AND used_at IS NULL`

// A new password ends every session, including the attacker's.
const endSessions = `DELETE FROM sessions WHERE user_id = $1`

func fresh(c *pgx.Conn, users int) []int64 {
	run(c, schema)
	rows, err := c.Query(ctx, `INSERT INTO users (email, password)
	  SELECT 'user' || g || '@example.com', 'old-password'
	  FROM generate_series(1, $1::int) g RETURNING id`, users)
	if err != nil {
		panic(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		panic(err)
	}
	return ids
}

func emailOf(id int64) string { return fmt.Sprintf("user%d@example.com", id) }
