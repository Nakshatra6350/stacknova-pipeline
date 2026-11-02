package main

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
)

// The table every lookup test reads.
const usersTable = `
CREATE TABLE users (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL
);`

// The one check: is this name in the table?
const check = `SELECT 1 FROM users WHERE username = $1`

const total = 10_000_000

// load fills users with 10 million names, then builds the unique index.
func load(c *pgx.Conn) {
	run(c, "DROP TABLE IF EXISTS users CASCADE")
	run(c, usersTable)
	start := time.Now()
	i := uint64(0)
	_, err := c.CopyFrom(ctx, pgx.Identifier{"users"}, []string{"username"},
		pgx.CopyFromFunc(func() ([]any, error) {
			if i == total {
				return nil, nil
			}
			i++
			return []any{name(i - 1)}, nil
		}))
	if err != nil {
		panic(err)
	}
	fmt.Printf("copied %d names in %.0f s\n", total,
		time.Since(start).Seconds())
	start = time.Now()
	run(c, "SET maintenance_work_mem = '512MB'")
	run(c, `ALTER TABLE users ADD CONSTRAINT users_username_key
	        UNIQUE (username)`)
	fmt.Printf("unique index built in %.0f s\n", time.Since(start).Seconds())
	run(c, "VACUUM ANALYZE users")
	fmt.Printf("table %s, username index %s\n",
		one[string](c, "SELECT pg_size_pretty(pg_table_size('users'))"),
		one[string](c, `SELECT pg_size_pretty(
		                pg_relation_size('users_username_key'))`))
	for _, n := range []int{1_000, 10_000, 100_000, 1_000_000} {
		t := fmt.Sprintf("users_%d", n)
		run(c, "DROP TABLE IF EXISTS "+t)
		run(c, fmt.Sprintf(`CREATE TABLE %s AS
		   SELECT id, username FROM users WHERE id <= %d`, t, n))
		run(c, fmt.Sprintf("CREATE UNIQUE INDEX %s_key ON %s (username)", t, t))
		run(c, "VACUUM ANALYZE "+t)
	}
}

const offScans = `SET enable_indexscan = off;
SET enable_indexonlyscan = off;
SET enable_bitmapscan = off`
const onScans = `RESET enable_indexscan;
RESET enable_indexonlyscan;
RESET enable_bitmapscan`

// scale: one check per table size, with and without the index.
func scale(c *pgx.Conn) {
	fmt.Println("rows       index avg ms  p99 ms   no index avg ms (tries)")
	for _, n := range []int{1_000, 10_000, 100_000, 1_000_000, total} {
		t := fmt.Sprintf("users_%d", n)
		if n == total {
			t = "users"
		}
		q := strings.Replace(check, "users", t, 1)
		free := func(i int) string { return name(uint64(total + 1000 + i)) }
		probe := func(i int) string { // half taken, half free
			if i%2 == 0 {
				return free(i)
			}
			return name(uint64(i*7919) % uint64(n))
		}
		var hit int
		// planned afresh each time: a prepared plan ignores the SETs below
		ask := func(s string) {
			c.QueryRow(ctx, q, pgx.QueryExecModeExec, s).Scan(&hit)
		}
		run(c, onScans)
		timed(200, func(i int) { ask(probe(i)) }) // warm up
		avg, p99 := timed(1000, func(i int) { ask(probe(i)) })
		fmt.Printf("  index:   %s\n", plan(c, q, free(1)))
		run(c, offScans)
		tries := 1000
		switch {
		case n >= total:
			tries = 20
		case n >= 1_000_000:
			tries = 50
		case n >= 100_000:
			tries = 200
		}
		timed(3, func(i int) { ask(free(i)) })
		scan, _ := timed(tries, func(i int) { ask(free(i)) })
		fmt.Printf("  no index: %s\n", plan(c, q, free(1)))
		fmt.Printf("%-10d %-13.3f %-8.3f %.3f (%d)\n", n, avg, p99, scan, tries)
		run(c, onScans)
	}
}

// decodeKey reads a text key out of pageinspect's hex: one length byte
// (length+1, shifted left, low bit set), then the letters.
func decodeKey(hexData string) string {
	parts := strings.Fields(hexData)
	if len(parts) == 0 {
		return ""
	}
	var first byte
	fmt.Sscanf(parts[0], "%02x", &first)
	n := int(first>>1) - 1
	out := make([]byte, 0, n)
	for _, p := range parts[1:] {
		if len(out) == n {
			break
		}
		var b byte
		fmt.Sscanf(p, "%02x", &b)
		out = append(out, b)
	}
	return string(out)
}

type item struct {
	key   string
	child int64
}

func pageItems(c *pgx.Conn, idx string, page int64) []item {
	rows, err := c.Query(ctx, `SELECT ctid::text, data FROM bt_page_items($1, $2)
	                           ORDER BY itemoffset`, idx, page)
	if err != nil {
		panic(err)
	}
	var items []item
	for rows.Next() {
		var ctid, data string
		if err := rows.Scan(&ctid, &data); err != nil {
			panic(err)
		}
		var blk, off int64
		fmt.Sscanf(ctid, "(%d,%d)", &blk, &off)
		items = append(items, item{decodeKey(data), blk})
	}
	// a page that isn't the last on its level starts with its upper limit
	if one[int64](c, `SELECT btpo_next FROM bt_page_stats($1, $2)`, idx, page) != 0 {
		items = items[1:]
	}
	return items
}

// walk prints the real route through the index for one name, page by page.
func walk(c *pgx.Conn, idx, target string) {
	var level int
	var root int64
	if err := c.QueryRow(ctx, `SELECT level, root FROM bt_metap($1)`, idx).
		Scan(&level, &root); err != nil {
		panic(err)
	}
	fmt.Printf("route to %q:\n", target)
	page := root
	for l := level; l > 0; l-- {
		items := pageItems(c, idx, page)
		chosen := 0
		for i, it := range items {
			if it.key <= target {
				chosen = i
			}
		}
		next := items[chosen]
		fmt.Printf("  page %-7d level %d, %3d ranges: from %q, to page %d\n",
			page, l, len(items), next.key, next.child)
		fmt.Printf("    before it %q, after it %q\n", items[max(chosen-1, 0)].key,
			items[min(chosen+1, len(items)-1)].key)
		page = next.child
	}
	items := pageItems(c, idx, page)
	at := -1
	for i, it := range items {
		if it.key == target {
			at = i + 1
		}
	}
	fmt.Printf("  page %-7d leaf,   %3d names: %q is number %d\n",
		page, len(items), target, at)
	fmt.Printf("    before it %q, after it %q\n", items[max(at-2, 0)].key,
		items[min(at, len(items)-1)].key)
}

// tree: the index's real shape, and what a billion names would need.
func tree(c *pgx.Conn) {
	run(c, "CREATE EXTENSION IF NOT EXISTS pageinspect")
	for _, idx := range []string{"users_1000_key", "users_10000_key",
		"users_100000_key", "users_1000000_key", "users_username_key"} {
		level := one[int32](c, `SELECT level FROM bt_metap($1)`, idx)
		fmt.Printf("%-20s %d pages deep, %s\n", idx, level+1, one[string](c,
			"SELECT pg_size_pretty(pg_relation_size($1::regclass))", idx))
	}
	const idx = "users_username_key"
	rows, err := c.Query(ctx, `SELECT type::text, count(*),
	    round(avg(live_items), 1)::float8
	    FROM bt_multi_page_stats($1, 1, -1) GROUP BY 1 ORDER BY 1`, idx)
	if err != nil {
		panic(err)
	}
	var leaf, inner float64
	for rows.Next() {
		var typ string
		var n int64
		var avg float64
		if err := rows.Scan(&typ, &n, &avg); err != nil {
			panic(err)
		}
		fmt.Printf("  %s pages: %d, average %.1f items each\n", typ, n, avg)
		if typ == "l" {
			leaf = avg
		}
		if typ == "i" || typ == "r" {
			inner = max(inner, avg)
		}
	}
	// a billion, from this index's own measured shape
	need, depth := 1e9/leaf, 1
	for need > 1 {
		need, depth = need/inner, depth+1
	}
	fmt.Printf("estimate for 1,000,000,000 names (%.0f a leaf, %.0f a branch): "+
		"%d pages deep\n", leaf, inner, depth)
	fmt.Println("id too: ", plan(c, "SELECT id FROM users WHERE username = $1", name(4242)))
	fmt.Println("taken:  ", plan(c, check, name(4242)))
	fmt.Println("free:   ", plan(c, check, name(total+1)))
	walk(c, idx, name(4242))
}

// The queries that quietly stop using the index.
var shapes = []struct{ label, where string }{
	{"exact", `username = $1`},
	{"lower both sides", `lower(username) = lower($1)`},
	{"upper both sides", `upper(username) = upper($1)`},
	{"ILIKE", `username ILIKE $1`},
	{"trim", `trim(username) = $1`},
	{"concat", `username || '' = $1`},
	{"other collation", `username = $1 COLLATE "C"`},
	{"cast to varchar", `username::varchar = $1`},
	{"prefix LIKE", `username LIKE substr($1, 1, 6) || '%'`},
}

func traps(c *pgx.Conn, tries int) {
	fmt.Printf("%-18s %-11s %s\n", "query", "avg ms", "plan")
	for _, s := range shapes {
		q := "SELECT 1 FROM users WHERE " + s.where
		arg := func(i int) string { return name(uint64(i*104729) % total) }
		var hit int
		timed(1, func(i int) { c.QueryRow(ctx, q, arg(i)).Scan(&hit) })
		avg, _ := timed(tries, func(i int) { c.QueryRow(ctx, q, arg(i)).Scan(&hit) })
		fmt.Printf("%-18s %-11.3f %s\n", s.label, avg, plan(c, q, arg(0)))
	}
}

// buildUnderLoad builds an index while 4 writers keep inserting.
func buildUnderLoad(c *pgx.Conn, label, sql string) {
	var stop atomic.Bool
	var worst, count, failed atomic.Int64
	var wg sync.WaitGroup
	for w := 0; w < 4; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			wc := connect()
			defer wc.Close(ctx)
			for i := uint64(0); !stop.Load(); i++ {
				start := time.Now()
				_, err := wc.Exec(ctx,
					"INSERT INTO users (username) VALUES ($1)",
					fmt.Sprintf("zzz%d_%d_%d", w, time.Now().UnixNano(), i))
				if err != nil {
					failed.Add(1)
				}
				count.Add(1)
				if d := time.Since(start).Milliseconds(); d > worst.Load() {
					worst.Store(d)
				}
				time.Sleep(20 * time.Millisecond)
			}
		}(w)
	}
	time.Sleep(time.Second) // the load is running before the build starts
	start := time.Now()
	_, err := c.Exec(ctx, sql)
	build := time.Since(start)
	time.Sleep(time.Second)
	stop.Store(true)
	wg.Wait()
	status := "ok"
	if err != nil {
		status = errText(err)
	}
	fmt.Printf("%-13s build %5.1f s, longest write wait %6d ms, "+
		"%d writes, %d failed (%s)\n",
		label, build.Seconds(), worst.Load(), count.Load(), failed.Load(), status)
	run(c, "DELETE FROM users WHERE username LIKE 'zzz%'")
}

// The index for the case-insensitive check, plain and on a live table.
const lowerPlain = `CREATE UNIQUE INDEX users_lower_key
  ON users (lower(username))`
const lowerLive = `CREATE UNIQUE INDEX CONCURRENTLY users_lower_key
  ON users (lower(username))`

// The check once that index exists.
const checkLower = `SELECT 1 FROM users WHERE lower(username) = lower($1)`

func lowerFix(c *pgx.Conn) {
	const drop = "DROP INDEX IF EXISTS users_lower_key"
	run(c, drop)
	run(c, "SET maintenance_work_mem = '512MB'")
	buildUnderLoad(c, "plain", lowerPlain)
	run(c, drop)
	buildUnderLoad(c, "CONCURRENTLY", lowerLive)
	fmt.Println("index size", one[string](c,
		"SELECT pg_size_pretty(pg_relation_size('users_lower_key'))"))
	run(c, "VACUUM ANALYZE users")
	var hit int
	timed(200, func(i int) { c.QueryRow(ctx, checkLower, name(uint64(i))).Scan(&hit) })
	avg, p99 := timed(1000, func(i int) {
		c.QueryRow(ctx, checkLower, strings.ToUpper(name(uint64(i*104729)%total))).Scan(&hit)
	})
	fmt.Printf("lower() with its own index: avg %.3f ms, p99 %.3f ms\n%s\n",
		avg, p99, plan(c, checkLower, name(1)))
	// the index is on lower(): a query that forgets to lower its argument
	missed := 0
	for i := 0; i < 1000; i++ {
		if !one[bool](c, `SELECT EXISTS (SELECT 1 FROM users
		                  WHERE lower(username) = $1)`,
			strings.ToUpper(name(uint64(i*104729)%total))) {
			missed++
		}
	}
	fmt.Printf("lower(username) = $1, typed in capitals: %d of 1000 taken names "+
		"said free\n", missed)
}

// hashIndex: can a hash index replace the B-tree?
func hashIndex(c *pgx.Conn) {
	_, err := c.Exec(ctx, "CREATE UNIQUE INDEX users_h ON users USING hash (username)")
	fmt.Println("unique hash index:", errText(err))
	run(c, "SET maintenance_work_mem = '512MB'")
	run(c, "DROP INDEX IF EXISTS users_h")
	start := time.Now()
	run(c, "CREATE INDEX users_h ON users USING hash (username)")
	fmt.Printf("hash index built in %.0f s, %s\n", time.Since(start).Seconds(),
		one[string](c, "SELECT pg_size_pretty(pg_relation_size('users_h'))"))
	run(c, "ALTER TABLE users DROP CONSTRAINT users_username_key")
	run(c, "ANALYZE users")
	var hit int
	ask := func(i int) {
		c.QueryRow(ctx, check, name(uint64(i*104729)%total)).Scan(&hit)
	}
	timed(200, ask)
	avg, p99 := timed(1000, ask)
	fmt.Printf("hash:   avg %.3f ms, p99 %.3f ms, %s\n", avg, p99, plan(c, check, name(1)))
	fmt.Println("hash, sorted range:", plan(c,
		"SELECT username FROM users WHERE username > 'zo' ORDER BY username LIMIT 1"))
	run(c, `ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username)`)
	run(c, "DROP INDEX users_h")
	run(c, "ANALYZE users")
	timed(200, ask)
	avg, p99 = timed(1000, ask)
	fmt.Printf("b-tree: avg %.3f ms, p99 %.3f ms, %s\n", avg, p99, plan(c, check, name(1)))
}

// writes: what each index costs an insert.
func writes(c *pgx.Conn) {
	const n = 20_000
	for _, cfg := range []struct{ label, sql string }{
		{"no index", ""},
		{"UNIQUE(username)", `CREATE UNIQUE INDEX w_u ON w_users (username)`},
		{"+ lower(username)", `CREATE UNIQUE INDEX w_u ON w_users (username);
		                       CREATE UNIQUE INDEX w_l ON w_users (lower(username))`},
	} {
		run(c, "DROP TABLE IF EXISTS w_users")
		run(c, "CREATE TABLE w_users AS SELECT username FROM users_1000000")
		if cfg.sql != "" {
			run(c, cfg.sql)
		}
		run(c, "CHECKPOINT")
		start := time.Now()
		for i := 0; i < n; i++ {
			run(c, "INSERT INTO w_users (username) VALUES ($1)", name(uint64(total+i)))
		}
		s := time.Since(start).Seconds()
		fmt.Printf("%-20s %6.0f inserts a second (%.2f ms each)\n",
			cfg.label, n/s, s*1000/n)
	}
	run(c, "DROP TABLE IF EXISTS w_users")
}

// cold: the same check straight after a restart.
func cold(c *pgx.Conn) {
	fmt.Println("first:", plan(c, check, name(777)))
	fmt.Println("again:", plan(c, check, name(777)))
	var hit int
	avg, _ := timed(1000, func(i int) {
		c.QueryRow(ctx, check, name(uint64(i*104729)%total)).Scan(&hit)
	})
	fmt.Printf("then 1000 checks: avg %.3f ms\n", avg)
}
