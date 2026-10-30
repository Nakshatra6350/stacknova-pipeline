// You tapped Pay twice (look v4 #2): a phone app, a payment server and a
// card network, and what a retry does to each of them.
//
//	go run . -mode=lost-reply-no-key      // reply lost, app retries: 2 charges
//	go run . -mode=lost-reply-key         // the fix: the retry gets reply 1
//	go run . -mode=double-tap-check-first // key looked up first: both charge
//	go run . -mode=double-tap-key         // key claimed by INSERT: 1 charge
//	go run . -mode=changed-amount         // same key, new amount: 422
//	go run . -mode=global-keys            // keys shared by every account
//	go run . -mode=account-keys           // the same keys, one per account
//	go run . -mode=crash-no-network-key   // dies after charging; recovery
//	go run . -mode=crash-network-key      // the same, key passed on
//
// Each run is N shoppers, each buying headphones for $49.99. "Charged twice"
// counts shoppers the card network took money from more than once.
// Needs a Postgres URL in DATABASE_URL.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const schema = `
DROP TABLE IF EXISTS card_charges, idempotency_keys;
CREATE TABLE card_charges (        -- the card network: money taken
  id           bigserial PRIMARY KEY,
  account_id   text   NOT NULL,
  amount_cents bigint NOT NULL,
  network_key  text   UNIQUE       -- the key the server passes on
);
CREATE TABLE idempotency_keys (    -- the server's memory of every key
  account_id   text  NOT NULL,
  key          text  NOT NULL,
  request_hash text  NOT NULL,
  request      jsonb NOT NULL,
  response     jsonb,              -- NULL while the first one runs
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, key)    -- a key belongs to one account
);`

type payment struct {
	Item        string `json:"item"`
	AmountCents int64  `json:"amount_cents"`
}

type receipt struct {
	ChargeID    int64  `json:"charge_id"`
	Account     string `json:"account"`
	AmountCents int64  `json:"amount_cents"`
}

var (
	latency   = 20 * time.Millisecond  // one trip to the card network
	retryWait = 100 * time.Millisecond // the app's wait between tries
)

// charge is the card network: it takes the money and answers with a
// charge id. Given a key it has seen, it answers with that charge instead
// of taking the money again, the way Stripe's Idempotency-Key works.
func charge(ctx context.Context, db *pgxpool.Pool, account string,
	p payment, networkKey *string) (int64, error) {
	time.Sleep(latency)
	var id int64
	err := db.QueryRow(ctx, `
		INSERT INTO card_charges (account_id, amount_cents, network_key)
		VALUES ($1, $2, $3)
		ON CONFLICT (network_key)
		DO UPDATE SET network_key = EXCLUDED.network_key
		RETURNING id`, account, p.AmountCents, networkKey).Scan(&id)
	return id, err
}

type server struct {
	db      *pgxpool.Pool
	scoped  bool     // a key belongs to one account (false: the bug)
	passOn  bool     // pass the key on to the card network
	crash   bool     // die after charging, before saving the reply
	crashed sync.Map // keys whose first request already died
}

// payNoKey is the usual first version: every request is a new payment.
func (s *server) payNoKey(w http.ResponseWriter, r *http.Request) {
	// finish the charge even if the phone gives up and disconnects
	ctx := context.WithoutCancel(r.Context())
	account, p, _, err := read(r)
	if err != nil {
		problem(w, http.StatusBadRequest, err.Error())
		return
	}
	id, err := charge(ctx, s.db, account, p, nil)
	if err != nil {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	reply(w, receipt{id, account, p.AmountCents})
}

// payCheckFirst has a key, but looks it up before charging. Two requests
// with the same key that arrive together both find nothing; both charge.
func (s *server) payCheckFirst(w http.ResponseWriter, r *http.Request) {
	ctx := context.WithoutCancel(r.Context())
	account, p, raw, err := read(r)
	key := r.Header.Get("Idempotency-Key")
	if err != nil || key == "" {
		problem(w, http.StatusBadRequest, "payment and key required")
		return
	}
	var saved []byte
	err = s.db.QueryRow(ctx, `
		SELECT response FROM idempotency_keys
		WHERE account_id = $1 AND key = $2`, account, key).Scan(&saved)
	if err == nil {
		send(w, saved) // a retry: the first reply again
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, err := charge(ctx, s.db, account, p, nil)
	if err != nil {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	body, _ := json.Marshal(receipt{id, account, p.AmountCents})
	_, err = s.db.Exec(ctx, `
		INSERT INTO idempotency_keys
		  (account_id, key, request_hash, request, response)
		VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
		account, key, fingerprint(raw), raw, body)
	if err != nil {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	send(w, body)
}

// payKey is the fix. It claims the key before charging, with one INSERT
// that the primary key lets only one request win. Every later request
// with that key gets the first one's reply, or 409 while the first is
// still running, or 422 if it asks for a different payment.
func (s *server) payKey(w http.ResponseWriter, r *http.Request) {
	ctx := context.WithoutCancel(r.Context())
	account, p, raw, err := read(r)
	key := r.Header.Get("Idempotency-Key")
	if err != nil || key == "" {
		problem(w, http.StatusBadRequest, "payment and key required")
		return
	}
	owner := account
	if !s.scoped {
		owner = "" // the bug: one key space for every account
	}
	hash := fingerprint(raw)
	tag, err := s.db.Exec(ctx, `
		INSERT INTO idempotency_keys (account_id, key, request_hash, request)
		VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
		owner, key, hash, raw)
	if err != nil {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 { // this key was used before
		var savedHash string
		var saved []byte
		err := s.db.QueryRow(ctx, `
			SELECT request_hash, response FROM idempotency_keys
			WHERE account_id = $1 AND key = $2`,
			owner, key).Scan(&savedHash, &saved)
		switch {
		case err != nil:
			problem(w, http.StatusInternalServerError, err.Error())
		case savedHash != hash:
			problem(w, http.StatusUnprocessableEntity, "key reused")
		case saved == nil:
			problem(w, http.StatusConflict, "still running")
		default:
			send(w, saved)
		}
		return
	}
	var networkKey *string
	if s.passOn {
		k := owner + "/" + key
		networkKey = &k
	}
	id, err := charge(ctx, s.db, account, p, networkKey)
	if err != nil {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s.crash {
		if _, died := s.crashed.LoadOrStore(key, true); !died {
			problem(w, http.StatusBadGateway, "died before saving")
			return
		}
	}
	body, _ := json.Marshal(receipt{id, account, p.AmountCents})
	_, err = s.db.Exec(ctx, `
		UPDATE idempotency_keys SET response = $3
		WHERE account_id = $1 AND key = $2`, owner, key, body)
	if err != nil {
		problem(w, http.StatusInternalServerError, err.Error())
		return
	}
	send(w, body)
}

// recoverStuck finishes payments whose server died between charging and
// saving the reply: rows with no reply, older than any request takes. It
// charges again with the same network key, so a card network that already
// took the money answers with that charge instead. Several workers run it
// at once; SKIP LOCKED hands each of them different rows.
func (s *server) recoverStuck(ctx context.Context) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT account_id, key, request FROM idempotency_keys
			WHERE response IS NULL
			  AND created_at < now() - interval '500 milliseconds'
			FOR UPDATE SKIP LOCKED LIMIT 10`)
		if err != nil {
			return err
		}
		type stuck struct {
			account, key string
			p            payment
		}
		var all []stuck
		for rows.Next() {
			var st stuck
			if err := rows.Scan(&st.account, &st.key, &st.p); err != nil {
				return err
			}
			all = append(all, st)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for _, st := range all {
			var networkKey *string
			if s.passOn {
				k := st.account + "/" + st.key
				networkKey = &k
			}
			id, err := charge(ctx, s.db, st.account, st.p, networkKey)
			if err != nil {
				return err
			}
			body, _ := json.Marshal(receipt{id, st.account, st.p.AmountCents})
			_, err = tx.Exec(ctx, `
				UPDATE idempotency_keys SET response = $3
				WHERE account_id = $1 AND key = $2`, st.account, st.key, body)
			if err != nil {
				return err
			}
		}
		return nil
	})
}

// read returns the account, the payment and the raw body (for the
// fingerprint). X-Account stands in for the logged-in user; a real server
// takes it from the session, never from the request.
func read(r *http.Request) (string, payment, []byte, error) {
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return "", payment{}, nil, err
	}
	var p payment
	if err := json.Unmarshal(raw, &p); err != nil {
		return "", payment{}, nil, err
	}
	return r.Header.Get("X-Account"), p, raw, nil
}

func fingerprint(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func reply(w http.ResponseWriter, rc receipt) {
	body, _ := json.Marshal(rc)
	send(w, body)
}

func send(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

func problem(w http.ResponseWriter, status int, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"title": title})
}

// attempt is one tap or retry from the app: it sends the payment once and
// returns the status and the receipt, if one came back.
func attempt(ctx context.Context, url, account, key string,
	p payment) (int, receipt, error) {
	body, _ := json.Marshal(p)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
		bytes.NewReader(body))
	if err != nil {
		return 0, receipt{}, err
	}
	req.Header.Set("X-Account", account)
	if key != "" {
		// the same key on every attempt of this checkout
		req.Header.Set("Idempotency-Key", key)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, receipt{}, err
	}
	defer resp.Body.Close()
	var rc receipt
	if resp.StatusCode == http.StatusOK {
		err = json.NewDecoder(resp.Body).Decode(&rc)
	}
	return resp.StatusCode, rc, err
}

// outcome is what the app ends up showing for one checkout.
type outcome struct {
	status    int     // the last reply: 200 paid, 422 refused, ...
	receipt   receipt // when paid
	conflicts int     // 409s on the way: "still running, ask again"
}

// pay is the app: it sends the payment and tries again every 100 ms while
// there is no answer (no reply, 409 or 502), for up to 6 seconds.
func pay(ctx context.Context, url, account, key string,
	p payment) (outcome, error) {
	var o outcome
	for range 60 {
		status, rc, err := attempt(ctx, url, account, key, p)
		o.status = status
		switch {
		case err != nil, status == http.StatusBadGateway:
		case status == http.StatusConflict:
			o.conflicts++
		default:
			o.receipt = rc
			return o, nil
		}
		time.Sleep(retryWait)
	}
	return o, errors.New("gave up")
}

var headphones = payment{Item: "headphones", AmountCents: 4999}

// checkout is one shopper buying the headphones, the way the mode says.
func checkout(ctx context.Context, url, mode, account string) (
	[]outcome, error) {
	key := rand.Text() // made once, when the checkout screen opens
	switch mode {
	case "lost-reply-no-key":
		key = ""
	case "global-keys", "account-keys":
		key = "checkout-1" // every app counts its checkouts from 1
	}
	switch mode {
	case "lost-reply-no-key", "lost-reply-key":
		// paid, but the reply never reaches the phone
		attempt(ctx, url, account, key, headphones)
		o, err := pay(ctx, url, account, key, headphones)
		return []outcome{o}, err
	case "changed-amount":
		attempt(ctx, url, account, key, headphones) // the reply is lost
		more := payment{Item: "headphones", AmountCents: 5999}
		o, err := pay(ctx, url, account, key, more)
		return []outcome{o}, err
	case "double-tap-check-first", "double-tap-key":
		taps := make([]outcome, 2)
		errs := make([]error, 2)
		start := make(chan struct{})
		var both sync.WaitGroup
		for i := range taps {
			both.Add(1)
			go func() {
				defer both.Done()
				<-start // two taps on Pay: same moment, same key
				taps[i], errs[i] = pay(ctx, url, account, key, headphones)
			}()
		}
		close(start)
		both.Wait()
		return taps, errors.Join(errs...)
	default: // global-keys, account-keys, crash-*
		o, err := pay(ctx, url, account, key, headphones)
		return []outcome{o}, err
	}
}

func main() {
	mode := flag.String("mode", "lost-reply-no-key", "see the top of main.go")
	shoppers := flag.Int("n", 1000, "how many shoppers check out")
	flag.Parse()

	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	cfg.MaxConns = 60
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(ctx, schema); err != nil {
		log.Fatal(err)
	}
	// open every connection first, so the run measures payments, not
	// connecting
	conns := make([]*pgxpool.Conn, 0, cfg.MaxConns)
	for range cfg.MaxConns {
		c, err := db.Acquire(ctx)
		if err != nil {
			log.Fatal(err)
		}
		conns = append(conns, c)
	}
	for _, c := range conns {
		c.Release()
	}

	s := &server{db: db, scoped: *mode != "global-keys",
		passOn: *mode == "crash-network-key",
		crash:  *mode == "crash-no-network-key" || *mode == "crash-network-key"}
	handler := map[string]http.HandlerFunc{"lost-reply-no-key": s.payNoKey,
		"double-tap-check-first": s.payCheckFirst}[*mode]
	if handler == nil {
		handler = s.payKey
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /pay", handler)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	url := srv.URL + "/pay"
	// keep connections open between attempts
	t := http.DefaultTransport.(*http.Transport)
	t.MaxIdleConns, t.MaxIdleConnsPerHost = 500, 500

	if s.crash { // the recovery job: 10 workers, each looking every 100 ms
		stop := make(chan struct{})
		defer close(stop)
		for range 10 {
			go func() {
				for {
					select {
					case <-stop:
						return
					case <-time.After(100 * time.Millisecond):
						if err := s.recoverStuck(ctx); err != nil {
							log.Fatal(err)
						}
					}
				}
			}()
		}
	}

	var mu sync.Mutex
	wrong, conflicts, refused, gaveUp := 0, 0, 0, 0
	slots := make(chan struct{}, 50) // 50 shoppers at a time
	var wg sync.WaitGroup
	began := time.Now()
	for n := range *shoppers {
		wg.Add(1)
		slots <- struct{}{}
		go func() {
			defer func() { <-slots; wg.Done() }()
			account := fmt.Sprintf("shopper%d", n)
			outs, err := checkout(ctx, url, *mode, account)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				gaveUp++
			}
			for _, o := range outs {
				conflicts += o.conflicts
				if o.status == http.StatusUnprocessableEntity {
					refused++
				}
				if o.status == http.StatusOK && o.receipt.Account != account {
					wrong++ // told "Paid" with another shopper's receipt
				}
			}
		}()
	}
	wg.Wait()
	srv.Close() // waits for requests still running: the count is final

	var charges, twice, charged int
	err = db.QueryRow(ctx, `
		SELECT coalesce(sum(n), 0)::int, count(*) FILTER (WHERE n > 1),
		       count(*)
		FROM (SELECT account_id, count(*) AS n
		      FROM card_charges GROUP BY account_id) per_shopper`).
		Scan(&charges, &twice, &charged)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("%s: %d shoppers, %d charges, %d charged twice (%d ms)\n",
		*mode, *shoppers, charges, twice, time.Since(began).Milliseconds())
	fmt.Printf("  not charged: %d · someone else's receipt: %d"+
		" · 409 then retried: %d · refused 422: %d · gave up: %d\n",
		*shoppers-charged, wrong, conflicts, refused, gaveUp)
}
