// Why your OTP dies in 30 seconds (look v4 #3): an authenticator app and a
// login server that never talk, and what can go wrong between them.
//
//	go run . -mode=rfc              // the official test values
//	go run . -mode=offline          // the phone: a program with no network
//	go run . -mode=typing-exact     // only this step's code is accepted
//	go run . -mode=typing-window    // the step before and after too
//	go run . -mode=drift            // the phone's clock is off: a table
//	go run . -mode=replay-naive     // someone sends your code again
//	go run . -mode=replay-once      // the fix: a code works once
//	go run . -mode=race-look-first  // both at once, step looked up first
//	go run . -mode=race-once        // both at once, one conditional UPDATE
//	go run . -mode=ahead-store-now  // phone ahead, server saves its own step
//	go run . -mode=ahead-store-code // phone ahead, server saves the code's
//	go run . -mode=used-global      // one list of used codes for everyone
//	go run . -mode=used-account     // a list per account
//	go run . -mode=brute-no-limit   // 100 guesses a second, no limit
//	go run . -mode=brute-lockout    // 5 wrong tries, then a 15-minute lock
//	go run . -mode=brute-100        // disabled after 100 wrong tries
//	go run . -mode=secret-weak      // secrets from math/rand and the clock
//	go run . -mode=secret-strong    // secrets from crypto/rand
//	go run . -mode=leak-plain       // the table leaks, secrets as they are
//	go run . -mode=leak-sealed      // the table leaks, secrets sealed
//	go run . -mode=swap-unbound     // someone copies their secret to a victim
//	go run . -mode=swap-bound       // sealed for one account only
//	go run . -mode=now              // one code, every step, for the demo key
//
// The modes that log in need a Postgres URL in DATABASE_URL.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"hash"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// the secret in the video and the guide's QR code, made to be read: real
// secrets come from NewSecret
const demoSecret = "STACKNOVABEHINDTHEBUTTONTHREEOTP"

type vector struct {
	h      func() hash.Hash
	secret string
	time   int64
	want   string
}

// rfcVectors checks our code against RFC 6238 Appendix B (with the longer
// keys of its Appendix A for SHA-256 and SHA-512) and RFC 4226 Appendix D.
func rfcVectors() (right, total int) {
	const k20 = "12345678901234567890"
	k32, k64 := k20+k20[:12], k20+k20+k20+k20[:4]
	totp := []vector{
		{sha1.New, k20, 59, "94287082"}, {sha256.New, k32, 59, "46119246"},
		{sha512.New, k64, 59, "90693936"},
		{sha1.New, k20, 1111111109, "07081804"},
		{sha256.New, k32, 1111111109, "68084774"},
		{sha512.New, k64, 1111111109, "25091201"},
		{sha1.New, k20, 1111111111, "14050471"},
		{sha256.New, k32, 1111111111, "67062674"},
		{sha512.New, k64, 1111111111, "99943326"},
		{sha1.New, k20, 1234567890, "89005924"},
		{sha256.New, k32, 1234567890, "91819424"},
		{sha512.New, k64, 1234567890, "93441116"},
		{sha1.New, k20, 2000000000, "69279037"},
		{sha256.New, k32, 2000000000, "90698825"},
		{sha512.New, k64, 2000000000, "38618901"},
		{sha1.New, k20, 20000000000, "65353130"},
		{sha256.New, k32, 20000000000, "77737706"},
		{sha512.New, k64, 20000000000, "47863826"},
	}
	for _, v := range totp {
		if hotp(v.h, []byte(v.secret), uint64(v.time/30), 8) == v.want {
			right++
		}
	}
	counter := []string{"755224", "287082", "359152", "969429", "338314",
		"254676", "287922", "162583", "399871", "520489"}
	for n, want := range counter {
		if hotp(sha1.New, []byte(k20), uint64(n), 6) == want {
			right++
		}
	}
	return right, len(totp) + len(counter)
}

// showCode prints one code with every step in between, for the demo secret.
func showCode(at time.Time) {
	secret, err := base32NoPad.DecodeString(demoSecret)
	if err != nil {
		log.Fatal(err)
	}
	step := stepAt(at)
	msg := binary.BigEndian.AppendUint64(nil, uint64(step))
	mac := hmac.New(sha1.New, secret)
	mac.Write(msg)
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	n := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	fmt.Println("uri    ", EnrolURI("StackNova", "demo", secret))
	fmt.Println("time   ", at.UTC().Format(time.RFC3339), at.Unix())
	fmt.Println("step   ", step)
	fmt.Println("message", hex.EncodeToString(msg))
	fmt.Println("hmac   ", hex.EncodeToString(sum))
	fmt.Println("offset ", off)
	fmt.Println("4 bytes", hex.EncodeToString(sum[off:off+4]))
	fmt.Println("number ", n)
	fmt.Println("code   ", fmt.Sprintf("%06d", n%1_000_000))
}

// phone is the authenticator app, run as its own program: it reads secrets
// from a file and prints a code for each. It opens no sockets at all.
func phone(file string, at int64) {
	raw, err := os.ReadFile(file)
	if err != nil {
		log.Fatal(err)
	}
	now := time.Now()
	if at != 0 {
		now = time.Unix(at, 0)
	}
	for _, line := range strings.Fields(string(raw)) {
		secret, err := hex.DecodeString(line)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(Code(secret, now))
	}
}

// offline runs that program and has the server check every code it printed.
func offline(n int) {
	secrets := make([][]byte, n)
	var list strings.Builder
	for i := range secrets {
		secrets[i] = NewSecret()
		list.WriteString(hex.EncodeToString(secrets[i]) + "\n")
	}
	file, err := os.CreateTemp("", "secrets")
	if err != nil {
		log.Fatal(err)
	}
	defer os.Remove(file.Name())
	file.WriteString(list.String())
	file.Close()
	out, err := exec.Command(os.Args[0], "-phone="+file.Name()).Output()
	if err != nil {
		log.Fatal(err)
	}
	right := 0
	for i, code := range strings.Fields(string(out)) {
		if _, ok := match(secrets[i], code, time.Now(), 1); ok {
			right++
		}
	}
	fmt.Printf("offline: %d phones, %d codes accepted\n", n, right)
}

// send is one person, or one attacker, sending a code. True means "you're in".
func send(ctx context.Context, url string, account int64, code string) bool {
	body, _ := json.Marshal(login{Code: code})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
		bytes.NewReader(body))
	if err != nil {
		log.Fatal(err)
	}
	req.Header.Set("X-Account", fmt.Sprint(account))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// both sends two requests with the same code at the same moment.
func both(ctx context.Context, url string, account int64, code string) (a,
	b bool) {
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); <-start; a = send(ctx, url, account, code) }()
	go func() { defer wg.Done(); <-start; b = send(ctx, url, account, code) }()
	close(start)
	wg.Wait()
	return a, b
}

// each runs f for every account, 50 at a time.
func each(n int, f func(account int64)) {
	slots := make(chan struct{}, 50)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		slots <- struct{}{}
		go func() {
			defer func() { <-slots; wg.Done() }()
			f(int64(i + 1))
		}()
	}
	wg.Wait()
}

func connect(ctx context.Context) *pgxpool.Pool {
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	cfg.MaxConns = 60
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	if _, err := db.Exec(ctx, schema); err != nil {
		log.Fatal(err)
	}
	// open every connection first: the run measures logins, not connecting
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
	return db
}

// nextStep sleeps until the server's clock enters the next 30-second step.
func nextStep() {
	time.Sleep(time.Until(time.Unix((stepAt(time.Now())+1)*30, 0)))
}

// logins runs the modes that go through the login server.
func logins(mode string, n int) {
	ctx := context.Background()
	db := connect(ctx)
	defer db.Close()

	s := &server{db: db, scoped: mode == "used-account",
		storeNow: mode == "ahead-store-now", bind: mode == "swap-bound"}
	if mode == "leak-sealed" || strings.HasPrefix(mode, "swap") {
		key := make([]byte, 32)
		rand.Read(key)
		s.aead = newSealer(key)
	}
	handler := map[string]http.HandlerFunc{
		"replay-naive": s.loginNaive, "race-look-first": s.loginLookFirst,
		"used-global": s.loginUsedCodes, "used-account": s.loginUsedCodes,
	}[mode]
	if handler == nil {
		handler = s.loginOnce
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /login/otp", handler)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	url := srv.URL + "/login/otp"
	t := http.DefaultTransport.(*http.Transport)
	t.MaxIdleConns, t.MaxIdleConnsPerHost = 500, 500

	// everyone signs up: account 0 is the attacker's own
	secrets := make([][]byte, n+1)
	rows := make([][]any, n+1)
	for i := range secrets {
		secrets[i] = NewSecret()
		stored := secrets[i]
		if s.aead != nil {
			var data []byte
			if s.bind {
				data = label(int64(i))
			}
			stored = seal(s.aead, stored, data)
		}
		rows[i] = []any{int64(i), stored}
	}
	_, err := db.CopyFrom(ctx, pgx.Identifier{"otp_accounts"},
		[]string{"account_id", "secret"}, pgx.CopyFromRows(rows))
	if err != nil {
		log.Fatal(err)
	}

	var mu sync.Mutex
	person, attacker := 0, 0
	add := func(p, a bool) {
		mu.Lock()
		defer mu.Unlock()
		if p {
			person++
		}
		if a {
			attacker++
		}
	}
	began := time.Now()
	switch mode {
	case "replay-naive", "replay-once":
		// you log in; someone who saw the code sends it a moment later
		each(n, func(a int64) {
			code := Code(secrets[a], time.Now())
			p := send(ctx, url, a, code)
			add(p, send(ctx, url, a, code))
		})
	case "race-look-first", "race-once":
		// a fake login page's bot races you: same code, same moment
		each(n, func(a int64) {
			p, q := both(ctx, url, a, Code(secrets[a], time.Now()))
			add(p || q, p && q) // "attacker" here means both got in
		})
	case "ahead-store-now", "ahead-store-code":
		// the phone's clock is 30 s ahead: a new step begins, you log in
		nextStep()
		codes := make([]string, n+1)
		logged := make([]bool, n+1)
		each(n, func(a int64) {
			codes[a] = Code(secrets[a], time.Now().Add(30*time.Second))
			logged[a] = send(ctx, url, a, codes[a])
		})
		// the server's clock reaches the code's step; someone sends it again
		nextStep()
		each(n, func(a int64) { add(logged[a], send(ctx, url, a, codes[a])) })
	case "used-global", "used-account":
		// everyone logs in during the same 30 seconds, once
		at := time.Now()
		each(n, func(a int64) {
			add(send(ctx, url, a, Code(secrets[a], at)), false)
		})
	case "leak-plain", "leak-sealed":
		// someone has a copy of the table and your password, and no phone
		person = n
		each(n, func(a int64) {
			var stored []byte
			err := db.QueryRow(ctx, `SELECT secret FROM otp_accounts
				WHERE account_id = $1`, a).Scan(&stored)
			if err != nil {
				log.Fatal(err)
			}
			add(false, send(ctx, url, a, Code(stored, time.Now())))
		})
	case "swap-unbound", "swap-bound":
		// someone can write to the table: their own secret, on your row
		person = n
		each(n, func(a int64) {
			_, err := db.Exec(ctx, `UPDATE otp_accounts
				SET secret = (SELECT secret FROM otp_accounts
				              WHERE account_id = 0)
				WHERE account_id = $1`, a)
			if err != nil {
				log.Fatal(err)
			}
			add(false, send(ctx, url, a, Code(secrets[0], time.Now())))
		})
	default:
		log.Fatalf("no mode called %s", mode)
	}
	srv.Close() // waits for requests still running: the count is final
	fmt.Printf("%s: %d accounts, %d attackers got in, "+
		"%d people refused (%d ms)\n", mode, n, attacker, n-person,
		time.Since(began).Milliseconds())
}

func main() {
	mode := flag.String("mode", "rfc", "see the top of main.go")
	n := flag.Int("n", 1000, "how many accounts")
	phoneFile := flag.String("phone", "", "be the phone: a file of secrets")
	at := flag.Int64("at", 0, "the phone's time, in Unix seconds (0: now)")
	flag.Parse()

	if *phoneFile != "" { // this run is the phone program
		phone(*phoneFile, *at)
		return
	}
	switch *mode {
	case "rfc":
		right, total := rfcVectors()
		fmt.Printf("rfc: %d of %d official test values match\n", right, total)
	case "now":
		when := time.Now()
		if *at != 0 {
			when = time.Unix(*at, 0)
		}
		showCode(when)
	case "offline":
		offline(*n)
	case "typing-exact":
		fmt.Printf("typing-exact: %d people, %d refused\n", *n, typing(*n, 0))
	case "typing-window":
		fmt.Printf("typing-window: %d people, %d refused\n", *n, typing(*n, 1))
	case "drift":
		fmt.Println("clock off by   exact   ±1 step   ±2 steps")
		for _, d := range []int{0, 5, 15, 29, 30, 45, 60, 75, 90, 120} {
			off := time.Duration(d) * time.Second
			fmt.Printf("%9d s %6.0f%% %8.0f%% %9.0f%%\n", d,
				accepted(*n, 0, off), accepted(*n, 1, off),
				accepted(*n, 2, off))
		}
	case "brute-no-limit":
		brute(*mode, *n, 3000, 30*time.Second, 72*time.Hour, 0)
	case "brute-lockout":
		brute(*mode, *n, 5, 15*time.Minute, 24*time.Hour, 0)
	case "brute-100":
		brute(*mode, *n, 100, time.Second, time.Hour, 100)
	case "secret-weak":
		secretsTest(*mode, *n, true)
	case "secret-strong":
		secretsTest(*mode, *n, false)
	default:
		logins(*mode, *n)
	}
}
