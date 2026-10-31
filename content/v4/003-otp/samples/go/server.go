// The login server: the second step of a login, after the password. It keeps
// each account's secret and the last step that account has used.
package main

import (
	"context"
	"crypto/cipher"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const schema = `
DROP TABLE IF EXISTS otp_accounts, used_codes;
CREATE TABLE otp_accounts (
  account_id bigint PRIMARY KEY,
  secret     bytea  NOT NULL,        -- sealed, in the modes that seal it
  last_step  bigint NOT NULL DEFAULT 0
);
CREATE TABLE used_codes (            -- the other way to remember: every code
  account_id bigint NOT NULL,
  code       text   NOT NULL,
  PRIMARY KEY (account_id, code)     -- a used code belongs to one account
);`

type server struct {
	db       *pgxpool.Pool
	aead     cipher.AEAD // nil: secrets are stored as they are (the bug)
	bind     bool        // a sealed secret opens for its own account only
	storeNow bool        // save the server's step, not the code's (the bug)
	scoped   bool        // used codes belong to one account
}

// login is what the phone's owner, or anyone else, sends after the password.
type login struct {
	Code string `json:"code"`
}

// read returns the account and the code. X-Account stands in for the session
// the password step made; a real server never takes it from the request.
func read(r *http.Request) (int64, string, error) {
	var l login
	if err := json.NewDecoder(r.Body).Decode(&l); err != nil {
		return 0, "", err
	}
	account, err := strconv.ParseInt(r.Header.Get("X-Account"), 10, 64)
	return account, l.Code, err
}

// secret loads an account's secret and the last step it used.
func (s *server) secret(ctx context.Context, account int64) ([]byte, int64,
	error) {
	var stored []byte
	var last int64
	err := s.db.QueryRow(ctx,
		`SELECT secret, last_step FROM otp_accounts WHERE account_id = $1`,
		account).Scan(&stored, &last)
	if err != nil || s.aead == nil {
		return stored, last, err
	}
	var data []byte
	if s.bind {
		data = label(account)
	}
	secret, err := unseal(s.aead, stored, data)
	return secret, last, err
}

func refuse(w http.ResponseWriter, why string) {
	http.Error(w, why, http.StatusUnauthorized)
}

// loginNaive is the usual first version: a right code is a right code, as
// many times as it is sent.
func (s *server) loginNaive(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	account, code, err := read(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	secret, _, err := s.secret(ctx, account)
	if err != nil {
		refuse(w, "no such account")
		return
	}
	if _, ok := match(secret, code, time.Now(), 1); !ok {
		refuse(w, "wrong code")
		return
	}
	w.WriteHeader(http.StatusOK)
}

// loginLookFirst remembers the last step, but looks before it writes: the
// last-seat bug again. Two requests at once can both read the old step.
func (s *server) loginLookFirst(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	account, code, err := read(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	secret, last, err := s.secret(ctx, account)
	if err != nil {
		refuse(w, "no such account")
		return
	}
	step, ok := match(secret, code, time.Now(), 1)
	if !ok || step <= last {
		refuse(w, "wrong or used code")
		return
	}
	_, err = s.db.Exec(ctx,
		`UPDATE otp_accounts SET last_step = $1 WHERE account_id = $2`,
		step, account)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// loginOnce is the fix: spend the step with one conditional UPDATE. Postgres
// lets one request change the row; a repeat changes 0 rows.
func (s *server) loginOnce(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	account, code, err := read(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	secret, _, err := s.secret(ctx, account)
	if err != nil {
		refuse(w, "no such account")
		return
	}
	step, ok := match(secret, code, time.Now(), 1)
	if !ok {
		refuse(w, "wrong code")
		return
	}
	spend := step // the step the code belongs to
	if s.storeNow {
		spend = stepAt(time.Now()) // the bug: the server's step instead
	}
	tag, err := s.db.Exec(ctx, `
		UPDATE otp_accounts SET last_step = $1
		WHERE account_id = $2 AND last_step < $1`, spend, account)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		refuse(w, "this code was already used")
		return
	}
	w.WriteHeader(http.StatusOK)
}

// loginUsedCodes remembers every used code instead of the last step. Scoped,
// it works; with one list of codes for everyone, it refuses honest people.
func (s *server) loginUsedCodes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	account, code, err := read(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	secret, _, err := s.secret(ctx, account)
	if err != nil {
		refuse(w, "no such account")
		return
	}
	if _, ok := match(secret, code, time.Now(), 1); !ok {
		refuse(w, "wrong code")
		return
	}
	owner := account
	if !s.scoped {
		owner = 0 // the bug: every account shares one list of used codes
	}
	tag, err := s.db.Exec(ctx, `
		INSERT INTO used_codes (account_id, code) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, owner, code)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		refuse(w, "this code was already used")
		return
	}
	w.WriteHeader(http.StatusOK)
}
