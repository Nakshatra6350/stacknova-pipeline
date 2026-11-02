package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"time"
)

// limiter is a token bucket per client: a burst, then a steady rate.
type limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // tokens a second
	burst   float64
}

type bucket struct {
	tokens float64
	last   time.Time
}

func (l *limiter) allow(client string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[client]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[client] = b
	}
	b.tokens += now.Sub(b.last).Seconds() * l.rate
	b.tokens = min(b.tokens, l.burst)
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// checkEndpoint answers /check?name=..., through the database.
func checkEndpoint(l *limiter) http.Handler {
	c := connect()
	var mu sync.Mutex
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if l != nil && !l.allow(r.Header.Get("X-Client"), time.Now()) {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		mu.Lock()
		taken := one[bool](c, "SELECT EXISTS (SELECT 1 FROM users WHERE username = $1)",
			r.URL.Query().Get("name"))
		mu.Unlock()
		fmt.Fprint(w, taken)
	})
}

// hammer is one client asking as fast as it can, for a few seconds.
func hammer(url string, seconds int) (answered, limited int64, found int64) {
	var wg sync.WaitGroup
	deadline := time.Now().Add(time.Duration(seconds) * time.Second)
	var a, l, f atomic.Int64
	for w := 0; w < 8; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			client := &http.Client{}
			for i := uint64(0); time.Now().Before(deadline); i++ {
				req, _ := http.NewRequest("GET", fmt.Sprintf("%s/check?name=%s",
					url, name(i*8+uint64(w))), nil)
				req.Header.Set("X-Client", "one-scraper")
				resp, err := client.Do(req)
				if err != nil {
					continue
				}
				body, _ := io.ReadAll(resp.Body)
				resp.Body.Close()
				if resp.StatusCode == http.StatusTooManyRequests {
					l.Add(1)
				} else {
					a.Add(1)
					if string(body) == "true" {
						f.Add(1)
					}
				}
			}
		}(w)
	}
	wg.Wait()
	return a.Load(), l.Load(), f.Load()
}

func scrape() {
	const seconds = 10
	open := httptest.NewServer(checkEndpoint(nil))
	defer open.Close()
	answered, _, found := hammer(open.URL, seconds)
	fmt.Printf("no limit: %d answers in %d s (%d a second), %d real usernames learned\n",
		answered, seconds, answered/seconds, found)
	const day = 86400
	fmt.Printf("  at that rate: %.0f million names a day from one laptop\n",
		float64(answered)/seconds*day/1e6)
	shut := httptest.NewServer(checkEndpoint(&limiter{
		buckets: map[string]*bucket{}, rate: 5, burst: 20}))
	defer shut.Close()
	answered, limited, found := hammer(shut.URL, seconds)
	fmt.Printf("5 a second, burst 20: %d answers, %d refused, %d usernames learned\n",
		answered, limited, found)
}
