// Package payments shows an idempotent "create payment" endpoint.
// Episode 001 — "Why your payment got charged twice".
//
// Table (PostgreSQL):
//
//	CREATE TABLE idempotency_keys (
//	    key           TEXT PRIMARY KEY,
//	    request_hash  BYTEA NOT NULL,
//	    status        TEXT  NOT NULL CHECK (status IN ('in_progress', 'completed')),
//	    response_code INT,
//	    response_body BYTEA,
//	    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
//	);
package payments

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"io"
	"net/http"
)

// Gateway is the downstream payment provider. It must accept an idempotency key too.
type Gateway interface {
	Charge(ctx context.Context, idempotencyKey string, body []byte) (status int, resp []byte, err error)
}

type Server struct {
	DB      *sql.DB
	Gateway Gateway
}

func (s *Server) CreatePayment(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 255 {
		http.Error(w, "Idempotency-Key header required (max 255 chars)", http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}
	fingerprint := sha256.Sum256(body)
	ctx := r.Context()

	// 1. Claim the key. The PRIMARY KEY makes the database pick exactly one winner.
	res, err := s.DB.ExecContext(ctx,
		`INSERT INTO idempotency_keys (key, request_hash, status)
		 VALUES ($1, $2, 'in_progress')
		 ON CONFLICT (key) DO NOTHING`, key, fingerprint[:])
	if err != nil {
		http.Error(w, "storage error", http.StatusServiceUnavailable)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		s.replay(ctx, w, key, fingerprint[:]) // someone already owns this key
		return
	}

	// 2. Do the work. Pass a key downstream so the gateway is idempotent too.
	status, resp, err := s.Gateway.Charge(ctx, "pay-"+key, body)
	if err != nil {
		// Outcome unknown: keep the row 'in_progress'; a reconciliation job asks the
		// gateway (with the same key) what happened. Never release the key and re-charge.
		http.Error(w, "payment outcome pending, retry later", http.StatusServiceUnavailable)
		return
	}

	// 3. Save the response next to the key, then answer.
	if _, err := s.DB.ExecContext(ctx,
		`UPDATE idempotency_keys
		    SET status = 'completed', response_code = $2, response_body = $3
		  WHERE key = $1`, key, status, resp); err != nil {
		http.Error(w, "storage error", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(status)
	_, _ = w.Write(resp)
}

func (s *Server) replay(ctx context.Context, w http.ResponseWriter, key string, fingerprint []byte) {
	var (
		storedHash []byte
		state      string
		code       sql.NullInt64
		body       []byte
	)
	err := s.DB.QueryRowContext(ctx,
		`SELECT request_hash, status, response_code, response_body
		   FROM idempotency_keys WHERE key = $1`, key).
		Scan(&storedHash, &state, &code, &body)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		http.Error(w, "key expired, retry", http.StatusConflict)
	case err != nil:
		http.Error(w, "storage error", http.StatusServiceUnavailable)
	case !bytes.Equal(storedHash, fingerprint):
		http.Error(w, "Idempotency-Key reused with a different request", http.StatusUnprocessableEntity)
	case state == "in_progress":
		http.Error(w, "request with this key is still in progress", http.StatusConflict)
	default:
		w.WriteHeader(int(code.Int64))
		_, _ = w.Write(body)
	}
}
