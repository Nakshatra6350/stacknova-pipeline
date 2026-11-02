package main

import (
	"fmt"
	"runtime"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// fill adds names [0, n) on every core.
func fill(f *Bloom, n uint64) {
	var wg sync.WaitGroup
	workers := uint64(runtime.NumCPU())
	for w := uint64(0); w < workers; w++ {
		wg.Add(1)
		go func(w uint64) {
			defer wg.Done()
			for i := n * w / workers; i < n*(w+1)/workers; i++ {
				f.Add(name(i))
			}
		}(w)
	}
	wg.Wait()
}

// falseRate asks about `tries` names that were never added.
func falseRate(f *Bloom, after, tries uint64) (rate float64, ns float64) {
	wrong := 0
	start := time.Now()
	for i := uint64(0); i < tries; i++ {
		if f.Has(name(after + i)) {
			wrong++
		}
	}
	return float64(wrong) / float64(tries),
		float64(time.Since(start).Nanoseconds()) / float64(tries)
}

func missed(f *Bloom, n, every uint64) (wrong int) {
	for i := uint64(0); i < n; i += every {
		if !f.Has(name(i)) {
			wrong++
		}
	}
	return wrong
}

// bloomRates: predicted against measured, for a few sizes.
func bloomRates() {
	const n, tries = 10_000_000, 2_000_000
	fmt.Println("bits/name k   memory    predicted  measured  false 'free' ns/check")
	for _, c := range []struct{ bits, k float64 }{{4.8, 3}, {9.6, 7}, {14.4, 10}, {19.2, 13}} {
		m := uint64(c.bits * n)
		f := NewBloom(m, uint64(c.k))
		fill(f, n)
		rate, ns := falseRate(f, n, tries)
		fmt.Printf("%-9.1f %-3.0f %-6.1f MB %-9.4f%% %-8.4f%% %-12d %.0f\n",
			c.bits, c.k, float64(m)/8e6, predicted(m, n, uint64(c.k))*100,
			rate*100, missed(f, n, 1), ns)
	}
}

// overfill: a filter sized for 1 million, loaded past that.
func overfill() {
	const planned = 1_000_000
	const m = planned * 96 / 10
	fmt.Println("names loaded  of plan  predicted  measured")
	for _, n := range []uint64{500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000} {
		f := NewBloom(m, 7)
		fill(f, n)
		rate, _ := falseRate(f, n, 1_000_000)
		fmt.Printf("%-13d %-8.1fx %-9.2f%% %.2f%%\n", n,
			float64(n)/planned, predicted(m, n, 7)*100, rate*100)
	}
}

// billion: a real billion names, 9.6 bits each.
func billion() {
	const n = 1_000_000_000
	const m = n * 96 / 10
	start := time.Now()
	f := NewBloom(m, 7)
	fill(f, n)
	fmt.Printf("%d names in %.2f GB, in %.0f s\n", n,
		float64(len(f.bits))*8/1e9, time.Since(start).Seconds())
	rate, ns := falseRate(f, n, 10_000_000)
	fmt.Printf("predicted %.4f%%, measured %.4f%% over 10,000,000 free names, "+
		"%.0f ns per check\n", predicted(m, n, 7)*100, rate*100, ns)
	start = time.Now()
	fmt.Printf("said free about a name it was given: %d of %d checked\n",
		missed(f, n, 100), n/100)
	fmt.Printf("(%.0f s)\n", time.Since(start).Seconds())
}

// checkWithFilter is the whole idea: the database only hears the maybes.
func checkWithFilter(c *pgx.Conn, f *Bloom, s string, asked *int) bool {
	if !f.Has(s) {
		return false // certainly free, no query at all
	}
	*asked++
	var taken bool
	if err := c.QueryRow(ctx,
		"SELECT EXISTS (SELECT 1 FROM users WHERE username = $1)",
		s).Scan(&taken); err != nil {
		panic(err)
	}
	return taken
}

// saves: how many database checks a filter avoids, by what people type.
func saves(c *pgx.Conn) {
	const n = 1000
	f := NewBloom(total*96/10, 7)
	start := time.Now()
	fill(f, total)
	fmt.Printf("filter of %.0f MB filled in %.1f s\n", float64(len(f.bits))*8/1e6,
		time.Since(start).Seconds())
	fmt.Println("names typed     db queries  wrong  avg ms with  avg ms without")
	for _, mix := range []struct {
		label string
		share int // percent free
	}{{"all free", 100}, {"half free", 50}, {"all taken", 0}} {
		probe := func(i int) (string, bool) {
			if i%100 < mix.share {
				return name(uint64(total + 1000 + i)), false
			}
			return name(uint64(i*7919) % total), true
		}
		asked, wrong := 0, 0
		with, _ := timed(n, func(i int) {
			s, truth := probe(i)
			if checkWithFilter(c, f, s, &asked) != truth {
				wrong++
			}
		})
		var taken bool
		without, _ := timed(n, func(i int) {
			s, _ := probe(i)
			c.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users WHERE username = $1)",
				s).Scan(&taken)
		})
		fmt.Printf("%-15s %-11d %-6d %-12.3f %.3f\n", mix.label, asked, wrong, with, without)
	}
}

// stale: two servers, a filter each. "Never wrong about free" needs every write.
func stale(c *pgx.Conn) {
	const n = 1000
	run(c, "DROP TABLE IF EXISTS claimed")
	run(c, "CREATE TABLE claimed (username TEXT NOT NULL UNIQUE)")
	one1 := func(label string, tell bool) {
		a, b := NewBloom(9_600_000, 7), NewBloom(9_600_000, 7)
		lied, refused := 0, 0
		for i := 0; i < n; i++ {
			s := fmt.Sprintf("%s_%v", name(uint64(i)), tell)
			run(c, "INSERT INTO claimed VALUES ($1)", s) // signed up on server A
			a.Add(s)
			if tell {
				b.Add(s)
			}
			if !b.Has(s) { // server B says: definitely free
				lied++
				_, err := c.Exec(ctx, "INSERT INTO claimed VALUES ($1)", s)
				if isTaken(err) {
					refused++
				}
			}
		}
		fmt.Printf("%-26s server B said free %4d of %d, unique index "+
			"refused %4d\n", label, lied, n, refused)
	}
	one1("each keeps its own", false)
	one1("every signup told to both", true)
	run(c, "DROP TABLE claimed")
	start := time.Now()
	f := NewBloom(total*96/10, 7)
	rows, err := c.Query(ctx, "SELECT username FROM users")
	if err != nil {
		panic(err)
	}
	loaded := 0
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			panic(err)
		}
		f.Add(s)
		loaded++
	}
	fmt.Printf("rebuilt from the table after a restart: %d names in %.1f s\n",
		loaded, time.Since(start).Seconds())
}

// forget: bits are shared, so clearing one name's bits breaks other names.
func forget(c *pgx.Conn) {
	const n, gone = 1_000_000, 1000
	f := NewBloom(n*96/10, 7)
	fill(f, n)
	// the names left, asked before anything is deleted
	before := missed(f, n, 1)
	for i := uint64(0); i < gone; i++ {
		f.Clear(name(i))
	}
	broken := 0
	for i := uint64(gone); i < n; i++ {
		if !f.Has(name(i)) {
			broken++
		}
	}
	fmt.Printf("said free about a real name: %d before, %d of %d after clearing "+
		"%d names\n", before, broken, n-gone, gone)
	// the safe way: leave the bits alone and let the database answer
	g := NewBloom(n*96/10, 7)
	fill(g, n)
	run(c, "DROP TABLE IF EXISTS kept")
	run(c, "CREATE TABLE kept AS SELECT username FROM users_1000000")
	run(c, "CREATE UNIQUE INDEX kept_u ON kept (username)")
	run(c, "DELETE FROM kept WHERE username = ANY($1)", func() []string {
		out := make([]string, gone)
		for i := range out {
			out[i] = name(uint64(i))
		}
		return out
	}())
	maybe, freeInDB := 0, 0
	for i := uint64(0); i < gone; i++ {
		s := name(i)
		if g.Has(s) {
			maybe++
			if !one[bool](c, "SELECT EXISTS (SELECT 1 FROM kept WHERE username = $1)", s) {
				freeInDB++
			}
		}
	}
	fmt.Printf("bits left alone: filter says maybe for %d of %d deleted names, "+
		"database says free for %d\n", maybe, gone, freeInDB)
	run(c, "DROP TABLE kept")
}

// memory: every name in a Go map, against the filter.
func memory() {
	var a, b runtime.MemStats
	const n = 10_000_000
	runtime.GC()
	runtime.ReadMemStats(&a)
	set := make(map[string]struct{})
	for i := uint64(0); i < n; i++ {
		set[name(i)] = struct{}{}
	}
	runtime.GC()
	runtime.ReadMemStats(&b)
	fmt.Printf("map of %d names: %.0f MB (%.0f bytes a name)\n", len(set),
		float64(b.HeapAlloc-a.HeapAlloc)/1e6, float64(b.HeapAlloc-a.HeapAlloc)/n)
	start := time.Now()
	hit := 0
	for i := uint64(0); i < 2_000_000; i++ {
		if _, ok := set[name(i*5)]; ok {
			hit++
		}
	}
	fmt.Printf("map check: %.0f ns (%d found)\n",
		float64(time.Since(start).Nanoseconds())/2e6, hit)
	f := NewBloom(n*96/10, 7)
	fill(f, n)
	fmt.Printf("filter of the same names: %.0f MB\n", float64(len(f.bits))*8/1e6)
}
