// One cache key expires, and the database gets a thousand queries at once
// (look v4 #10). Every number in the video and the guide comes from here:
//
//	go run . -mode=load      // 2,000,000 reviews, one product with 1,000,000
//	go run . -mode=query     // what one miss costs: the rating query, timed
//	go run . -mode=stampede  // 1,000 requests the moment the key expires
//	go run . -mode=servers   // the same, spread over 20 app servers
//	go run . -mode=together  // 10,000 keys cached at once expire at once
//	go run . -mode=early     // refreshing before expiry (simulated traffic)
//
// Needs Postgres in DATABASE_URL (default: demo@localhost:55432/cache).
package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const key = "rating:1" // the best-seller's rating: every product page asks

func main() {
	mode := flag.String("mode", "stampede", "load, query, stampede, servers, together or early")
	flag.Parse()
	switch *mode {
	case "together":
		together()
		return
	case "early":
		earlyRefresh()
		return
	}
	p := connect()
	defer p.Close()
	switch *mode {
	case "load":
		load(p)
	case "query":
		query(p)
	case "stampede":
		stampede(p)
	case "servers":
		servers(p)
	default:
		log.Fatalf("no mode %q", *mode)
	}
}

// query times one miss: the rating of the product with 1,000,000 reviews.
func query(p *pgxpool.Pool) {
	get := rating(p, 1)
	get() // warm the cache of pages
	var times []time.Duration
	var s Summary
	for range 20 {
		t := time.Now()
		s, _ = get()
		times = append(times, time.Since(t))
	}
	slices.Sort(times)
	fmt.Printf("one rating query: %s (median of 20); %d reviews, %.2f stars\n",
		ms(times[10]), s.Reviews, s.Stars)
}

// counted wraps a load so every real query is counted.
func counted(load Load, n *atomic.Int64) Load {
	return func() (Summary, error) {
		n.Add(1)
		return load()
	}
}

// storm sends n requests at the same instant and times each one.
func storm(n int, get func() (Summary, error)) (lat []time.Duration,
	wall time.Duration, failed int64) {
	start := make(chan struct{})
	lat = make([]time.Duration, n)
	var wg sync.WaitGroup
	var bad atomic.Int64
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			t := time.Now()
			if _, err := get(); err != nil {
				bad.Add(1)
			}
			lat[i] = time.Since(t)
		}()
	}
	t := time.Now()
	close(start)
	wg.Wait()
	return lat, time.Since(t), bad.Load()
}

func report(name string, queries int64, lat []time.Duration,
	wall time.Duration, failed int64) {
	slices.Sort(lat)
	n := len(lat)
	fmt.Printf("%-24s %5d queries  median %9s  99th %9s  slowest %9s"+
		"  all done %9s  failed %d\n", name, queries, ms(lat[n/2]),
		ms(lat[n*99/100]), ms(lat[n-1]), ms(wall), failed)
}

// stampede: the key has just expired, and 1,000 requests arrive together.
func stampede(p *pgxpool.Pool) {
	const n, ttl = 1000, time.Minute
	rating(p, 1)() // warm the cache of pages
	expired := func() map[string]entry {
		return map[string]entry{key: {Summary{}, time.Now().Add(-time.Second)}}
	}
	fresh := map[string]entry{key: {Summary{}, time.Now().Add(ttl)}}
	var q atomic.Int64

	hit := &Naive{data: fresh, ttl: ttl}
	lat, wall, bad := storm(n, func() (Summary, error) {
		return hit.Get(key, counted(rating(p, 1), &q))
	})
	report("fresh key (all hits)", q.Swap(0), lat, wall, bad)

	naive := &Naive{data: expired(), ttl: ttl}
	lat, wall, bad = storm(n, func() (Summary, error) {
		return naive.Get(key, counted(rating(p, 1), &q))
	})
	report("expired: everyone loads", q.Swap(0), lat, wall, bad)

	flight := &Flight{data: expired(), inflight: map[string]*call{}, ttl: ttl}
	lat, wall, bad = storm(n, func() (Summary, error) {
		return flight.Get(key, counted(rating(p, 1), &q))
	})
	report("expired: one loads", q.Swap(0), lat, wall, bad)

	stale := &Stale{data: expired(), refreshing: map[string]bool{}, ttl: ttl,
		maxStale: time.Hour,
		cold:     &Flight{data: map[string]entry{}, inflight: map[string]*call{}, ttl: ttl}}
	lat, wall, bad = storm(n, func() (Summary, error) {
		return stale.Get(key, counted(rating(p, 1), &q))
	})
	for { // the refresh runs in the background: wait for it to land
		stale.mu.Lock()
		busy := stale.refreshing[key]
		stale.mu.Unlock()
		if !busy {
			break
		}
		time.Sleep(time.Millisecond)
	}
	report("expired: serve old value", q.Swap(0), lat, wall, bad)
}

// servers: the same 1,000 requests over 20 app servers, each with its own
// one-load-at-a-time cache. Each server still sends its own query.
func servers(p *pgxpool.Pool) {
	const n, apps, ttl = 1000, 20, time.Minute
	rating(p, 1)()
	var caches []*Flight
	for range apps {
		caches = append(caches, &Flight{
			data:     map[string]entry{key: {Summary{}, time.Now().Add(-time.Second)}},
			inflight: map[string]*call{}, ttl: ttl})
	}
	var q, next atomic.Int64
	lat, wall, bad := storm(n, func() (Summary, error) {
		c := caches[next.Add(1)%apps] // a load balancer, round robin
		return c.Get(key, counted(rating(p, 1), &q))
	})
	report("20 servers, one loads each", q.Load(), lat, wall, bad)
}

// together: a deploy fills the cache with 10,000 keys in the same second,
// all with a 5-minute TTL. When do they expire?
func together() {
	const keys, ttl = 10000, 300 * time.Second
	for _, frac := range []float64{0, 0.1, 0.2} {
		r := rand.New(rand.NewPCG(10, 1))
		perSecond := map[int]int{}
		for range keys {
			perSecond[int(jitter(ttl, frac, r).Seconds())]++
		}
		worst := 0
		for _, c := range perSecond {
			worst = max(worst, c)
		}
		fmt.Printf("TTL 5 min, jitter ±%2.0f%%: worst second %5d expiries, "+
			"spread over %d seconds\n", frac*100, worst, len(perSecond))
	}
}

// earlyRefresh plays 10 minutes of traffic, one request every millisecond,
// on one key with a 60 s TTL and a 100 ms load. Virtual time: no database.
func earlyRefresh() {
	const ttl, delta, total = 60_000, 100, 600_000 // milliseconds
	// Waiting for expiry: every request in the 100 ms load misses.
	expiries := total / (ttl + delta)
	fmt.Printf("%-28s %5d loads, %6d requests waited\n",
		"expire, then everyone loads", expiries*delta, expiries*delta)
	fmt.Printf("%-28s %5d loads, %6d requests waited\n",
		"expire, then one loads", expiries, expiries*delta)
	for _, beta := range []float64{1, 2} {
		loads, waited := 0, 0
		for seed := range uint64(100) {
			l, w := xfetch(ttl, delta, total, beta, rand.New(rand.NewPCG(seed, 2)))
			loads += l
			waited += w
		}
		fmt.Printf("refresh early, beta %.0f %-11s %5.1f loads, %6.1f requests waited"+
			" (average of 100 runs)\n", beta, "", float64(loads)/100, float64(waited)/100)
	}
}

// xfetch: each request may refresh early (see early in cache.go). The one
// that refreshes waits for the load; everyone else still gets a fresh value.
func xfetch(ttl, delta, total int, beta float64, r *rand.Rand) (loads, waited int) {
	expires, landing := ttl, -1 // landing: when the refresh in flight lands
	for t := range total {
		if landing >= 0 && t >= landing {
			expires, landing = landing+ttl, -1
		}
		now := time.UnixMilli(int64(t))
		if t >= expires { // expired anyway: this request waits
			waited++
			if landing < 0 {
				loads++
				landing = t + delta
			}
			continue
		}
		if early(time.UnixMilli(int64(expires)), now,
			time.Duration(delta)*time.Millisecond, beta, r) {
			loads++ // this request refreshes, and waits for it
			waited++
			if landing < 0 || t+delta < landing {
				landing = t + delta
			}
		}
	}
	return loads, waited
}

func ms(d time.Duration) string {
	if d < time.Millisecond {
		return fmt.Sprintf("%.2f ms", float64(d.Microseconds())/1000)
	}
	return fmt.Sprintf("%.0f ms", float64(d.Milliseconds()))
}
