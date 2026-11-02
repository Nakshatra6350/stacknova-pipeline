package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const n = 1000

// leak: someone can read the table, and only read it (a backup, a read replica,
// one SQL injection). Every password in it is hashed.
func leak(c *pgx.Conn) {
	for _, plain := range []bool{true, false} {
		ids := fresh(c, n)
		run(c, "ALTER TABLE reset_tokens RENAME COLUMN token_hash TO token")
		for _, id := range ids {
			token := newToken()
			stored := token
			if !plain {
				stored = hashToken(token)
			}
			run(c, `INSERT INTO reset_tokens (token, user_id, expires_at)
			        VALUES ($1, $2, now() + interval '1 hour')`, stored, id)
		}
		// the attacker's copy of the table
		rows, err := c.Query(ctx, "SELECT token FROM reset_tokens")
		if err != nil {
			panic(err)
		}
		stolen, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			panic(err)
		}
		// and the attacker's only move: paste each one into the reset page,
		// which hashes what it's given when the table holds hashes
		taken := 0
		for _, s := range stolen {
			lookup := s
			if !plain {
				lookup = hashToken(s)
			}
			var userID int64
			err := c.QueryRow(ctx, `UPDATE reset_tokens SET used_at = now()
			    WHERE token = $1 AND used_at IS NULL AND expires_at > now()
			    RETURNING user_id`, lookup).Scan(&userID)
			if err == nil {
				run(c, "UPDATE users SET password = 'attacker' WHERE id = $1", userID)
				taken++
			}
		}
		left := one[int64](c, "SELECT count(*) FROM users WHERE password = 'old-password'")
		label := "tokens stored as they are"
		if !plain {
			label = "only SHA-256 stored      "
		}
		fmt.Printf("%s %d tokens stolen, %d accounts taken, %d untouched\n",
			label, len(stolen), taken, left)
	}
}

// hashes: why one fast hash is right here, and a slow one isn't.
func hashes(c *pgx.Conn) {
	token := newToken()
	avg, _ := timed(10000, func(int) { hashToken(token) })
	fmt.Printf("SHA-256 of a token: %.4f ms\n", avg)
	var cost10 float64
	for _, cost := range []int{10, 12} {
		avg, _ := timed(5, func(int) {
			bcrypt.GenerateFromPassword([]byte(token[:40]), cost)
		})
		fmt.Printf("bcrypt, cost %d: %.0f ms\n", cost, avg)
		if cost == 10 {
			cost10 = avg
		}
	}
	// bcrypt salts every hash, so you can't look a token up by its hash:
	// you'd have to test it against every row
	h1, _ := bcrypt.GenerateFromPassword([]byte(token[:40]), 10)
	h2, _ := bcrypt.GenerateFromPassword([]byte(token[:40]), 10)
	fmt.Printf("same token, bcrypt twice: same hash? %v; SHA-256 twice: same hash? %v\n",
		string(h1) == string(h2), hashToken(token) == hashToken(token))
	ids := fresh(c, 100000)
	for i, id := range ids {
		if i%100 == 0 {
			run(c, `INSERT INTO reset_tokens (token_hash, user_id, expires_at)
			        VALUES ($1, $2, now() + interval '1 hour')`, hashToken(newToken()), id)
		}
	}
	run(c, "ANALYZE reset_tokens")
	var id int64
	lookup, _ := timed(1000, func(int) {
		c.QueryRow(ctx, "SELECT user_id FROM reset_tokens WHERE token_hash = $1",
			hashToken(newToken())).Scan(&id)
	})
	fmt.Printf("find a token among %d rows by SHA-256: %.3f ms\n",
		one[int64](c, "SELECT count(*) FROM reset_tokens"), lookup)
	fmt.Printf("by bcrypt, testing each row at cost 10: about %.0f s\n",
		float64(one[int64](c, "SELECT count(*) FROM reset_tokens"))*cost10/1000)
}

// once: two clicks at the same moment, each setting a different password.
func once(c *pgx.Conn) {
	a, b := connect(), connect()
	defer a.Close(ctx)
	defer b.Close(ctx)
	for _, t := range []struct {
		label string
		f     func(*pgx.Conn, string, string) bool
	}{{"look, then write", redeemCheckFirst}, {"one UPDATE", redeem}} {
		ids := fresh(c, n)
		both, one1 := 0, 0
		for _, id := range ids {
			token := issue(c, id, time.Hour)
			var wg sync.WaitGroup
			start := make(chan struct{})
			var okA, okB bool
			wg.Add(2)
			go func() { defer wg.Done(); <-start; okA = t.f(a, token, "first") }()
			go func() { defer wg.Done(); <-start; okB = t.f(b, token, "second") }()
			close(start)
			wg.Wait()
			if okA && okB {
				both++
			} else if okA || okB {
				one1++
			}
		}
		fmt.Printf("%-18s both worked %4d of %d, exactly one worked %4d\n",
			t.label, both, n, one1)
	}
}

// scanner: a mail scanner opens every link before the person does.
func scanner(c *pgx.Conn) {
	for _, burnOnGet := range []bool{true, false} {
		ids := fresh(c, n)
		mux := http.NewServeMux()
		mux.HandleFunc("GET /reset", func(w http.ResponseWriter, r *http.Request) {
			token := r.URL.Query().Get("token")
			if burnOnGet { // using the token just because the page was opened
				if !redeem(c, token, "scanner-password") {
					w.WriteHeader(http.StatusGone)
				}
				return
			}
			// the safe way: opening the page changes nothing
			fmt.Fprint(w, `<form method="post">new password</form>`)
		})
		mux.HandleFunc("POST /reset", func(w http.ResponseWriter, r *http.Request) {
			if !redeem(c, r.URL.Query().Get("token"), "the-real-one") {
				w.WriteHeader(http.StatusGone)
			}
		})
		srv := httptest.NewServer(mux)
		burned, fine := 0, 0
		for _, id := range ids {
			link := srv.URL + "/reset?token=" + issue(c, id, time.Hour)
			get(link) // the scanner, seconds after the mail arrives
			if burnOnGet {
				if get(link) == http.StatusGone { // now the person clicks
					burned++
				}
				continue
			}
			if get(link) == 200 && post(link) == 200 {
				fine++
			}
		}
		srv.Close()
		changed := one[int64](c, "SELECT count(*) FROM users WHERE password = 'the-real-one'")
		if burnOnGet {
			fmt.Printf("GET uses the token: %d of %d people find their link dead\n", burned, n)
		} else {
			fmt.Printf("GET shows a form, POST uses it: %d of %d people reset fine, "+
				"%d passwords changed\n", fine, n, changed)
		}
	}
}

func get(url string) int {
	r, err := http.Get(url)
	if err != nil {
		panic(err)
	}
	io.Copy(io.Discard, r.Body)
	r.Body.Close()
	return r.StatusCode
}

func post(url string) int {
	r, err := http.Post(url, "text/plain", nil)
	if err != nil {
		panic(err)
	}
	io.Copy(io.Discard, r.Body)
	r.Body.Close()
	return r.StatusCode
}

// expiry: a link that has run out, by the database's clock.
func expiry(c *pgx.Conn) {
	ids := fresh(c, n)
	tokens := make([]string, n)
	for i, id := range ids {
		tokens[i] = issue(c, id, 2*time.Second)
	}
	early := 0
	for _, t := range tokens[:n/2] {
		if redeem(c, t, "ok") {
			early++
		}
	}
	time.Sleep(2500 * time.Millisecond)
	late := 0
	for _, t := range tokens[n/2:] {
		if redeem(c, t, "too-late") {
			late++
		}
	}
	fmt.Printf("used in time: %d of %d worked. Used after it ran out: %d of %d worked\n",
		early, n/2, late, n/2)
}

// oldLinks: someone asks three times. Is the first link still alive?
func oldLinks(c *pgx.Conn) {
	for _, cancel := range []bool{false, true} {
		ids := fresh(c, n)
		alive := 0
		for _, id := range ids {
			first := issue(c, id, time.Hour)
			issue(c, id, time.Hour)
			if cancel {
				run(c, cancelOld, id)
			}
			issue(c, id, time.Hour)
			if redeem(c, first, "from-the-old-email") {
				alive++
			}
		}
		label := "old links stay"
		if cancel {
			label = "a new link cancels them"
		}
		fmt.Printf("%-24s the first of 3 links still worked: %d of %d\n", label, alive, n)
	}
}

// sessionsTest: the attacker is logged in. The owner resets the password.
func sessionsTest(c *pgx.Conn) {
	for _, end := range []bool{false, true} {
		ids := fresh(c, n)
		for _, id := range ids {
			run(c, "INSERT INTO sessions (user_id) VALUES ($1)", id) // the attacker's
			if end {
				redeem(c, issue(c, id, time.Hour), "new-one")
				continue
			}
			var userID int64
			if err := c.QueryRow(ctx, useToken, hashToken(issue(c, id, time.Hour))).Scan(&userID); err != nil {
				panic(err)
			}
			run(c, "UPDATE users SET password = 'new-one' WHERE id = $1", userID)
		}
		left := one[int64](c, "SELECT count(*) FROM sessions")
		fmt.Printf("sessions ended on reset %-5v: attacker still logged in on %d of %d\n",
			end, left, n)
	}
}

// whose: the form sends user_id with the token, and the server believes it.
func whose(c *pgx.Conn) {
	for _, trust := range []bool{true, false} {
		ids := fresh(c, 2*n)
		taken := 0
		for i := 0; i < n; i++ {
			attacker, victim := ids[i], ids[n+i]
			token := issue(c, attacker, time.Hour) // the attacker's own, real link
			if trust {
				var owner int64
				err := c.QueryRow(ctx, useToken, hashToken(token)).Scan(&owner)
				if err == nil { // a valid token, so do what the form says
					run(c, "UPDATE users SET password = 'attacker' WHERE id = $1", victim)
				}
			} else {
				redeem(c, token, "attacker") // the token alone says whose it is
			}
			if one[string](c, "SELECT password FROM users WHERE id = $1", victim) == "attacker" {
				taken++
			}
		}
		label := "user_id from the form"
		if !trust {
			label = "user_id from the token"
		}
		fmt.Printf("%-24s victims' passwords changed: %d of %d\n", label, taken, n)
	}
}

// weak: the attacker asks for a link too, then tries every millisecond nearby.
func weak() {
	found, tries := 0, 0
	for i := 0; i < n; i++ {
		at := time.Now().Add(time.Duration(i) * time.Minute)
		victim := weakToken(at)
		// the attacker knows roughly when: within a second either way
		start := at.Add(-time.Second)
		for ms := 0; ms <= 2000; ms++ {
			tries++
			if weakToken(start.Add(time.Duration(ms)*time.Millisecond)) == victim {
				found++
				break
			}
		}
	}
	fmt.Printf("seeded with the time: %d of %d tokens found, %d tries each on average\n",
		found, n, tries/n)
	fmt.Printf("from crypto/rand: 2^256 possible, so no search is possible (see -mode=guesslong)\n")
}

// The check a 6-digit code needs: each guess counts, and the code dies at the limit.
const tryCode = `UPDATE codes SET tries = tries + 1
WHERE user_id = $1 AND tries < $2
RETURNING code = $3`

// guess: a 6-digit code. How long is a million tries?
func guess(c *pgx.Conn) {
	ids := fresh(c, 1)
	run(c, `DROP TABLE IF EXISTS codes;
	        CREATE TABLE codes (user_id BIGINT PRIMARY KEY, code TEXT NOT NULL,
	                            tries INT NOT NULL DEFAULT 0)`)
	setCode := func() {
		run(c, `INSERT INTO codes VALUES ($1, $2) ON CONFLICT (user_id)
		        DO UPDATE SET code = $2, tries = 0`, ids[0],
			fmt.Sprintf("%06d", time.Now().UnixNano()%1000000))
	}
	// no limit: 8 connections working through every code, as a script would
	const rounds, workers = 5, 8
	conns := make([]*pgx.Conn, workers)
	for i := range conns {
		conns[i] = connect()
		defer conns[i].Close(ctx)
	}
	found, attempts := 0, int64(0)
	start := time.Now()
	for r := 0; r < rounds; r++ {
		setCode()
		var wg sync.WaitGroup
		var mu sync.Mutex
		done := false
		for w := 0; w < workers; w++ {
			wg.Add(1)
			go func(w int) {
				defer wg.Done()
				for g := w; g < 1000000; g += workers {
					mu.Lock()
					stop := done
					attempts++
					mu.Unlock()
					if stop {
						return
					}
					var ok bool
					conns[w].QueryRow(ctx, "SELECT code = $2 FROM codes WHERE user_id = $1",
						ids[0], fmt.Sprintf("%06d", g)).Scan(&ok)
					if ok {
						mu.Lock()
						done = true
						found++
						mu.Unlock()
						return
					}
				}
			}(w)
		}
		wg.Wait()
	}
	took := time.Since(start).Seconds()
	fmt.Printf("no limit: found %d of %d codes, %.0f tries each, %.0f tries a second, "+
		"%.0f s each\n", found, rounds, float64(attempts)/rounds,
		float64(attempts)/took, took/rounds)
	// with a limit: 5 tries, then that code is dead
	const limit, codes = 5, 1000
	won := 0
	for r := 0; r < codes; r++ {
		setCode()
		for g := 0; g < 1000000; g++ {
			var ok bool
			err := c.QueryRow(ctx, tryCode, ids[0], limit,
				fmt.Sprintf("%06d", (g*7919+r)%1000000)).Scan(&ok)
			if noRows(err) {
				break // the sixth try: refused without even comparing
			}
			if ok {
				won++
				break
			}
		}
	}
	fmt.Printf("%d tries, then dead: found %d of %d codes\n", limit, won, codes)
	run(c, "DROP TABLE codes")
}

func guessLong() {
	token := newToken()
	start := time.Now()
	const runs = 1_000_000
	for i := 0; i < runs; i++ {
		hashToken(token)
	}
	perSecond := runs / time.Since(start).Seconds()
	const year = 365.25 * 86400
	fmt.Printf("%.1f million SHA-256 a second on this laptop\n", perSecond/1e6)
	for _, bits := range []float64{32, 64, 128, 256} {
		years := math.Pow(2, bits-1) / (perSecond * 1e9) / year
		fmt.Printf("%3.0f random bits, a billion of these laptops: %.3g years on average\n", bits, years)
	}
}

// host: the link is built from whatever Host the request claims.
func host(c *pgx.Conn) {
	for _, trust := range []bool{true, false} {
		ids := fresh(c, n)
		mux := http.NewServeMux()
		mux.HandleFunc("POST /forgot", func(w http.ResponseWriter, r *http.Request) {
			id, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
			base := "https://app.example"
			if trust {
				base = "https://" + r.Host
			}
			run(c, "INSERT INTO mail (sent_to, body) VALUES ($1, $2)", emailOf(id),
				base+"/reset?token="+issue(c, id, time.Hour))
		})
		srv := httptest.NewServer(mux)
		for _, id := range ids {
			req, _ := http.NewRequest("POST", fmt.Sprintf("%s/forgot?id=%d", srv.URL, id), nil)
			req.Host = "evil.example"
			r, err := http.DefaultClient.Do(req)
			if err != nil {
				panic(err)
			}
			r.Body.Close()
		}
		srv.Close()
		bad := one[int64](c, "SELECT count(*) FROM mail WHERE body LIKE 'https://evil.example/%'")
		label := "link built from Host"
		if !trust {
			label = "link from a fixed address"
		}
		fmt.Printf("%-26s real emails pointing at the attacker's site: %d of %d\n", label, bad, n)
	}
}

// twoEmails: GitLab's bug, in miniature. The form's email field can be a list.
func twoEmails(c *pgx.Conn) {
	type form struct {
		Email json.RawMessage `json:"email"`
	}
	for _, fixed := range []bool{false, true} {
		ids := fresh(c, n)
		request := func(body string) {
			var f form
			if err := json.Unmarshal([]byte(body), &f); err != nil {
				panic(err)
			}
			var list []string
			if json.Unmarshal(f.Email, &list) != nil {
				var single string
				json.Unmarshal(f.Email, &single)
				list = []string{single}
			}
			var userID int64
			var stored string
			// the account is found by any address in the list
			if err := c.QueryRow(ctx, `SELECT id, email FROM users
			    WHERE email = ANY($1) LIMIT 1`, list).Scan(&userID, &stored); err != nil {
				return
			}
			token := issue(c, userID, time.Hour)
			if fixed { // send only to the address the account already has
				run(c, "INSERT INTO mail (sent_to, body) VALUES ($1, $2)", stored, token)
				return
			}
			for _, to := range list { // send to whatever the form said
				run(c, "INSERT INTO mail (sent_to, body) VALUES ($1, $2)", to, token)
			}
		}
		for _, id := range ids {
			request(fmt.Sprintf(`{"email":["%s","attacker@evil.example"]}`, emailOf(id)))
		}
		got := one[int64](c, "SELECT count(*) FROM mail WHERE sent_to = 'attacker@evil.example'")
		taken := 0
		rows, _ := c.Query(ctx, "SELECT body FROM mail WHERE sent_to = 'attacker@evil.example'")
		tokens, _ := pgx.CollectRows(rows, pgx.RowTo[string])
		for _, t := range tokens {
			if redeem(c, t, "attacker") {
				taken++
			}
		}
		label := "sent to the form's list"
		if fixed {
			label = "sent to the stored address"
		}
		fmt.Printf("%-27s attacker's inbox got %d of %d real links, %d accounts taken\n",
			label, got, n, taken)
	}
}

// tell: can a stranger learn who has an account here?
func tell(c *pgx.Conn) {
	ids := fresh(c, n)
	const sendMail = 60 * time.Millisecond // a real mail API takes this long, or more
	for _, safe := range []bool{false, true} {
		queue := make(chan string, 2*n)
		go func() {
			for range queue {
				// a worker sends the mail after the request has gone
			}
		}()
		answer := func(email string) (text string) {
			var id int64
			err := c.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", email).Scan(&id)
			exists := err == nil
			if safe {
				if exists {
					queue <- email
				}
				return "If that address has an account, we've sent a link."
			}
			if !exists {
				return "No account with that email."
			}
			time.Sleep(sendMail)
			return "We've sent you a link."
		}
		// the words
		same := answer(emailOf(ids[0])) == answer("nobody@example.com")
		// and the stopwatch: is this one a real account?
		right := 0
		var real, fake float64
		clock := func(email string) time.Duration {
			s := time.Now()
			answer(email)
			return time.Since(s)
		}
		for i := 0; i < n/10; i++ {
			var tReal, tFake time.Duration
			if i%2 == 0 { // take turns, so going second isn't an advantage
				tReal = clock(emailOf(ids[i]))
				tFake = clock(fmt.Sprintf("nobody%d@example.com", i))
			} else {
				tFake = clock(fmt.Sprintf("nobody%d@example.com", i))
				tReal = clock(emailOf(ids[i]))
			}
			real += float64(tReal.Microseconds()) / 1000
			fake += float64(tFake.Microseconds()) / 1000
			if tReal > tFake {
				right++
			}
		}
		fmt.Printf("safe=%-5v same words: %-5v real account %.1f ms, no account %.1f ms, "+
			"the slower one was real %d of %d times\n",
			safe, same, real/(n/10), fake/(n/10), right, n/10)
		close(queue)
	}
}

// bomb: a stranger asks for 1,000 reset emails to the same person.
func bomb(c *pgx.Conn) {
	for _, limit := range []bool{false, true} {
		ids := fresh(c, 1)
		for i := 0; i < n; i++ {
			if limit {
				run(c, `INSERT INTO reset_tokens (token_hash, user_id, expires_at)
				  SELECT $1, $2, now() + interval '1 hour'
				  WHERE NOT EXISTS (SELECT 1 FROM reset_tokens
				    WHERE user_id = $2
				      AND expires_at > now() + interval '59 minutes')`,
					hashToken(newToken()), ids[0])
			} else {
				issue(c, ids[0], time.Hour)
			}
		}
		fmt.Printf("limit %-5v: %d requests, %d emails sent\n", limit, n,
			one[int64](c, "SELECT count(*) FROM reset_tokens"))
	}
}

// logs: the token is in the URL, and the URL is in the log.
func logs(c *pgx.Conn) {
	ids := fresh(c, n)
	var log strings.Builder
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(&log, "%s %s\n", r.Method, r.URL.RequestURI()) // a normal access log
	}))
	tokens := make([]string, n)
	for i, id := range ids {
		tokens[i] = issue(c, id, time.Hour)
		get(srv.URL + "/reset?token=" + tokens[i])
	}
	srv.Close()
	found := 0
	for _, t := range tokens {
		if strings.Contains(log.String(), t) {
			found++
		}
	}
	fmt.Printf("live tokens readable in the access log: %d of %d\n", found, n)
	// and the fix: a link that's only used once and soon is less use to a log reader
	for _, t := range tokens[:n/2] {
		redeem(c, t, "owner") // the owner used theirs
	}
	reused := 0
	for _, t := range tokens[:n/2] {
		if redeem(c, t, "log-reader") {
			reused++
		}
	}
	fmt.Printf("after the owner used it, someone reading the log: %d of %d worked\n", reused, n/2)
	unused := 0
	for _, t := range tokens[n/2:] {
		if redeem(c, t, "log-reader") {
			unused++
		}
	}
	fmt.Printf("links nobody used yet, from the log: %d of %d worked, until they expire\n", unused, n/2)
}

// signedToken needs no table: it's a signature over the things that change.
func signedToken(key []byte, userID int64, passwordHash string, expires int64) string {
	mac := hmac.New(sha256.New, key)
	fmt.Fprintf(mac, "%d|%s|%d", userID, passwordHash, expires)
	return fmt.Sprintf("%d.%d.%s", userID, expires,
		hex.EncodeToString(mac.Sum(nil)))
}

func checkSigned(c *pgx.Conn, key []byte, token string) (int64, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, false
	}
	userID, _ := strconv.ParseInt(parts[0], 10, 64)
	expires, _ := strconv.ParseInt(parts[1], 10, 64)
	if time.Now().Unix() > expires {
		return 0, false
	}
	var password string
	if c.QueryRow(ctx, "SELECT password FROM users WHERE id = $1", userID).
		Scan(&password) != nil {
		return 0, false
	}
	want := signedToken(key, userID, password, expires)
	return userID, subtle.ConstantTimeCompare([]byte(want), []byte(token)) == 1
}

func signed(c *pgx.Conn) {
	key := []byte(newToken())
	ids := fresh(c, n)
	first, second, forged, expiredOK := 0, 0, 0, 0
	for _, id := range ids {
		pw := one[string](c, "SELECT password FROM users WHERE id = $1", id)
		token := signedToken(key, id, pw, time.Now().Add(time.Hour).Unix())
		if _, ok := checkSigned(c, key, token); ok {
			first++
			run(c, "UPDATE users SET password = $1 WHERE id = $2",
				hashToken(newToken()), id) // a new password: the old link dies
		}
		if _, ok := checkSigned(c, key, token); ok {
			second++
		}
		// someone changes the user id in the link
		bad := fmt.Sprintf("%d%s", id+1, token[strings.Index(token, "."):])
		if _, ok := checkSigned(c, key, bad); ok {
			forged++
		}
		old := signedToken(key, id, pw, time.Now().Add(-time.Hour).Unix())
		if _, ok := checkSigned(c, key, old); ok {
			expiredOK++
		}
	}
	fmt.Printf("no table: first use %d of %d, second use %d, forged user id %d, "+
		"expired %d, token length %d\n", first, n, second, forged, expiredOK,
		len(signedToken(key, ids[0], "x", time.Now().Unix())))
}
