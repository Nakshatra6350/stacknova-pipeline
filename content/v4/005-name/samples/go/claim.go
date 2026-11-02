package main

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// caseRules: Alice and alice, under each rule that could stop them.
func caseRules(c *pgx.Conn) {
	run(c, "CREATE EXTENSION IF NOT EXISTS citext")
	run(c, `DROP COLLATION IF EXISTS ignore_case;
	        CREATE COLLATION ignore_case (provider = icu,
	          locale = 'und-u-ks-level2', deterministic = false)`)
	for _, rule := range []struct{ label, column, index string }{
		{"UNIQUE(username)", "username TEXT", "(username)"},
		{"UNIQUE(lower())", "username TEXT", "(lower(username))"},
		{"citext", "username CITEXT", "(username)"},
		{"ICU ignore_case", "username TEXT COLLATE ignore_case", "(username)"},
	} {
		run(c, "DROP TABLE IF EXISTS case_test")
		run(c, fmt.Sprintf("CREATE TABLE case_test (%s NOT NULL)", rule.column))
		run(c, "CREATE UNIQUE INDEX case_u ON case_test "+rule.index)
		both, refused := 0, 0
		for i := 0; i < 1000; i++ {
			n := name(uint64(i))
			run(c, "INSERT INTO case_test VALUES ($1)", n)
			_, err := c.Exec(ctx, "INSERT INTO case_test VALUES ($1)",
				strings.ToUpper(n[:1])+n[1:])
			if isTaken(err) {
				refused++
			} else if err == nil {
				both++
			} else {
				panic(err)
			}
		}
		fmt.Printf("%-18s both accepted %4d, second refused %4d\n",
			rule.label, both, refused)
	}
	_, err := c.Exec(ctx, "SELECT 1 FROM case_test WHERE username LIKE 'ka%'")
	if err != nil {
		fmt.Println("LIKE on the ICU column:", errText(err))
	}
	run(c, "DROP TABLE IF EXISTS case_test")
}

// dupes: a unique index can't be built while duplicates already exist.
func dupes(c *pgx.Conn) {
	run(c, "DROP TABLE IF EXISTS old_users")
	run(c, `CREATE TABLE old_users AS
	        SELECT id, username FROM users_100000`)
	for i := 0; i < 1000; i++ {
		run(c, "INSERT INTO old_users VALUES ($1, $2)", 100_000+i,
			strings.ToUpper(name(uint64(i))))
	}
	const build = `CREATE UNIQUE INDEX CONCURRENTLY old_lower
	               ON old_users (lower(username))`
	_, err := c.Exec(ctx, build)
	fmt.Println("build:", errText(err))
	fmt.Println("left behind, valid =", one[bool](c, `SELECT indisvalid FROM
	   pg_index WHERE indexrelid = 'old_lower'::regclass`))
	found := one[int64](c, findDupes)
	fmt.Println("the query finds", found, "names held twice")
	run(c, "DROP INDEX old_lower")
	run(c, `DELETE FROM old_users WHERE id >= 100000`)
	_, err = c.Exec(ctx, build)
	fmt.Println("after the clean-up, build error:", err)
	run(c, "DROP TABLE old_users")
}

// The names held twice, before a unique index can exist.
const findDupes = `SELECT count(*) FROM (
  SELECT lower(username) FROM old_users
  GROUP BY 1 HAVING count(*) > 1
) AS twice`

// The check every signup form does first. It only ever looks.
const lookFirst = `SELECT EXISTS (
  SELECT 1 FROM signups WHERE lower(username) = lower($1))`

// The claim: one statement, so nothing can get between the look and the write.
const claim = `INSERT INTO signups (username) VALUES ($1)
ON CONFLICT (lower(username)) DO NOTHING
RETURNING id`

// signupCheckFirst is the way most of us write it first.
func signupCheckFirst(c *pgx.Conn, name string) (ok bool) {
	if one[bool](c, lookFirst, name) {
		return false
	}
	run(c, "INSERT INTO signups (username) VALUES ($1)", name)
	return true
}

// signupClaim lets the unique index decide.
func signupClaim(c *pgx.Conn, name string) (ok bool) {
	var id int64
	err := c.QueryRow(ctx, claim, name).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false // someone got there first: show "taken"
	}
	if err != nil {
		panic(err)
	}
	return true
}

func twoAtOnce(a, b *pgx.Conn, n int, f func(*pgx.Conn, string) bool) (both int) {
	for i := 0; i < n; i++ {
		var wg sync.WaitGroup
		go1 := make(chan struct{})
		var okA, okB bool
		wg.Add(2)
		go func() { defer wg.Done(); <-go1; okA = f(a, name(uint64(i))) }()
		go func() { defer wg.Done(); <-go1; okB = f(b, name(uint64(i))) }()
		close(go1)
		wg.Wait()
		if okA && okB {
			both++
		}
	}
	return both
}

// race: two people, one name, both tap at the same moment.
func race(c *pgx.Conn) {
	const n = 1000
	a, b := connect(), connect()
	defer a.Close(ctx)
	defer b.Close(ctx)
	reset := func(index string) {
		run(c, "DROP TABLE IF EXISTS signups")
		run(c, `CREATE TABLE signups (
		          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
		          username TEXT NOT NULL)`)
		run(c, index)
	}
	count := func() int64 {
		return one[int64](c, `SELECT count(*) FROM (SELECT lower(username)
		   FROM signups GROUP BY 1 HAVING count(*) > 1) AS twice`)
	}
	reset("CREATE INDEX signups_l ON signups (lower(username))")
	both := twoAtOnce(a, b, n, signupCheckFirst)
	fmt.Printf("check, then insert, no unique rule: %d of %d names signed up "+
		"twice (%d in the table)\n", both, n, count())

	reset("CREATE UNIQUE INDEX signups_l ON signups (lower(username))")
	refused := 0
	for i := 0; i < n; i++ { // the tick went green for both; one taps first
		nm := name(uint64(i))
		seenA := one[bool](a, lookFirst, nm)
		seenB := one[bool](b, lookFirst, nm)
		if seenA || seenB {
			panic("the name should be free")
		}
		run(b, "INSERT INTO signups (username) VALUES ($1)", nm)
		if !signupClaim(a, nm) {
			refused++
		}
	}
	fmt.Printf("both saw a green tick, one tapped first: %d of %d second taps "+
		"refused, %d names twice\n", refused, n, count())

	reset("CREATE UNIQUE INDEX signups_l ON signups (lower(username))")
	both = twoAtOnce(a, b, n, signupClaim)
	fmt.Printf("one INSERT, unique rule: %d of %d names signed up twice "+
		"(%d in the table), %d rows\n", both, n, count(),
		one[int64](c, "SELECT count(*) FROM signups"))
	run(c, "DROP TABLE signups")
}

// deleted: a soft-deleted user keeps the name, unless the index says otherwise.
const liveOnly = `CREATE UNIQUE INDEX people_live ON people (lower(username))
  WHERE deleted_at IS NULL`

func deleted(c *pgx.Conn) {
	const n = 1000
	reset := func(index string) {
		run(c, "DROP TABLE IF EXISTS people")
		run(c, `CREATE TABLE people (username TEXT NOT NULL,
		                             deleted_at TIMESTAMPTZ)`)
		run(c, `INSERT INTO people SELECT username, NULL FROM users_1000000`)
		run(c, index)
		run(c, "ANALYZE people")
	}
	reuse := func() (refused, second int) {
		for i := 0; i < n; i++ {
			nm := name(uint64(i))
			run(c, "UPDATE people SET deleted_at = now() WHERE username = $1", nm)
			if _, err := c.Exec(ctx, "INSERT INTO people VALUES ($1)", nm); isTaken(err) {
				refused++
			} else if err == nil {
				// a second live holder must still be refused
				if _, err := c.Exec(ctx, "INSERT INTO people VALUES ($1)", nm); isTaken(err) {
					second++
				}
			}
		}
		return refused, second
	}
	reset("CREATE UNIQUE INDEX people_all ON people (lower(username))")
	refused, _ := reuse()
	fmt.Printf("unique on every row: %d of %d deleted names can't be reused\n", refused, n)
	reset(liveOnly)
	refused, second := reuse()
	fmt.Printf("unique on live rows: %d of %d refused, and a second live holder "+
		"refused %d of %d\n", refused, n, second, n)
	fmt.Println("check with the WHERE:   ", plan(c, `SELECT 1 FROM people
	   WHERE lower(username) = lower($1) AND deleted_at IS NULL`, name(5000)))
	fmt.Println("check without the WHERE:", plan(c, `SELECT 1 FROM people
	   WHERE lower(username) = lower($1)`, name(5000)))
	run(c, "DROP TABLE people")
}

// "Taken. Try one of these": five candidates, one round trip.
const whichAreFree = `SELECT c FROM unnest($1::text[]) AS c
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = c
)`

func suggest(c *pgx.Conn) {
	base := name(4242)
	candidates := func(i int) []string {
		// three taken on purpose, and two more that look like them
		return []string{name(uint64(i)), name(uint64(i + 1)), name(uint64(i + 2)),
			fmt.Sprintf("%s_%d", base, i), fmt.Sprintf("%s%d", base, i)}
	}
	var free int
	one5 := func(i int) {
		rows, err := c.Query(ctx, whichAreFree, candidates(i))
		if err != nil {
			panic(err)
		}
		free = 0
		for rows.Next() {
			free++
		}
	}
	timed(100, one5)
	avg, p99 := timed(1000, one5)
	fmt.Printf("one query: avg %.3f ms, p99 %.3f ms, %d of 5 free\n", avg, p99, free)
	var hit int
	five := func(i int) {
		for _, s := range candidates(i) {
			c.QueryRow(ctx, check, s).Scan(&hit)
		}
	}
	avg, p99 = timed(1000, five)
	fmt.Printf("five queries: avg %.3f ms, p99 %.3f ms\n", avg, p99)
}

// partition: what a billion-row table has to give up.
func partition(c *pgx.Conn) {
	try := func(label, sql string) {
		run(c, "DROP TABLE IF EXISTS parted")
		_, err := c.Exec(ctx, sql)
		if err != nil {
			fmt.Printf("%-34s %s\n", label, errText(err))
			return
		}
		fmt.Printf("%-34s accepted\n", label)
	}
	try("unique on the partition key", `CREATE TABLE parted (
	    username_key TEXT NOT NULL, UNIQUE (username_key)
	  ) PARTITION BY HASH (username_key)`)
	try("unique on another column", `CREATE TABLE parted (
	    id BIGINT, username_key TEXT NOT NULL, UNIQUE (id)
	  ) PARTITION BY HASH (username_key)`)
	try("partition key is an expression", `CREATE TABLE parted (
	    username TEXT NOT NULL, UNIQUE (username)
	  ) PARTITION BY HASH (lower(username))`)
	try("partition key is generated", `CREATE TABLE parted (
	    username TEXT NOT NULL,
	    username_key TEXT GENERATED ALWAYS AS (lower(username)) STORED,
	    UNIQUE (username_key)
	  ) PARTITION BY HASH (username_key)`)

	run(c, "DROP TABLE IF EXISTS parted")
	run(c, partitioned)
	for i := 0; i < 16; i++ {
		run(c, fmt.Sprintf(`CREATE TABLE parted_%d PARTITION OF parted
		  FOR VALUES WITH (MODULUS 16, REMAINDER %d)`, i, i))
	}
	start := time.Now()
	run(c, `INSERT INTO parted SELECT username, lower(username)
	        FROM users_1000000`)
	fmt.Printf("1,000,000 names into 16 partitions in %.1f s\n", time.Since(start).Seconds())
	run(c, "ANALYZE parted")
	const q = `SELECT 1 FROM parted WHERE username_key = lower($1)`
	fmt.Println("check:", plan(c, q, name(4242)))
	nodes := one[int64](c, `SELECT count(*) FROM pg_inherits
	                        WHERE inhparent = 'parted'::regclass`)
	fmt.Println("partitions:", nodes)
	var hit int
	timed(200, func(i int) { c.QueryRow(ctx, q, name(uint64(i))).Scan(&hit) })
	avg, p99 := timed(1000, func(i int) { c.QueryRow(ctx, q, name(uint64(i*7919)%1_000_000)).Scan(&hit) })
	fmt.Printf("avg %.3f ms, p99 %.3f ms\n", avg, p99)
	_, err := c.Exec(ctx, "INSERT INTO parted VALUES ($1, lower($1))",
		strings.ToUpper(name(4242)))
	fmt.Println("the same name in capitals:", errText(err))
	_, err = c.Exec(ctx, "INSERT INTO parted VALUES ('Sneaky', 'other')")
	fmt.Println("a key that doesn't match the name:", errText(err))
	run(c, "DROP TABLE parted")
}

// Split by a stored lower-case key: the unique rule can then span partitions.
// It can't be generated or an expression, so a CHECK keeps it honest.
const partitioned = `CREATE TABLE parted (
  username     TEXT NOT NULL,
  username_key TEXT NOT NULL CHECK (username_key = lower(username)),
  UNIQUE (username_key)
) PARTITION BY HASH (username_key)`
