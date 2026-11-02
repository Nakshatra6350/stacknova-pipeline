package main

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/text/secure/precis"
	"golang.org/x/text/unicode/norm"
)

// Letters that have a tiny capital form in Unicode.
var tiny = map[rune]rune{'a': 'ᴬ', 'b': 'ᴮ', 'd': 'ᴰ', 'e': 'ᴱ', 'g': 'ᴳ',
	'h': 'ᴴ', 'i': 'ᴵ', 'j': 'ᴶ', 'k': 'ᴷ', 'l': 'ᴸ', 'm': 'ᴹ', 'n': 'ᴺ',
	'o': 'ᴼ', 'p': 'ᴾ', 'r': 'ᴿ', 't': 'ᵀ', 'u': 'ᵁ', 'w': 'ᵂ'}

func toTiny(s string) string {
	return strings.Map(func(r rune) rune {
		if t, ok := tiny[r]; ok {
			return t
		}
		return r
	}, s)
}

// A cleaning function in the wrong order: lower, then normalize.
// "ᴮᴵᴳ" has no lower case, so it stays. Normalizing then makes it "BIG".
// Clean it once more and it is "big": a different answer.
func cleanWrong(s string) string {
	return norm.NFKC.String(strings.ToLower(s))
}

// The right order. Cleaning twice gives the same answer as cleaning once.
func cleanRight(s string) string {
	return strings.ToLower(norm.NFKC.String(s))
}

// Fewest surprises of all: refuse what isn't plain.
var plainName = regexp.MustCompile(`^[a-z0-9_]{3,30}$`)

func unicodeTricks(c *pgx.Conn) {
	const cyrillicA, zeroWidth = "а", "​"
	const bigbird = "ᴮᴵᴳᴮᴵᴿᴰ"
	fmt.Printf("%q: wrong order once %q, twice %q\n", bigbird,
		cleanWrong(bigbird), cleanWrong(cleanWrong(bigbird)))
	fmt.Printf("%q: right order once %q, twice %q\n", bigbird,
		cleanRight(bigbird), cleanRight(cleanRight(bigbird)))
	_, err := precis.UsernameCaseMapped.String(bigbird)
	fmt.Printf("PRECIS UsernameCaseMapped on %q: %v\n", bigbird, err)
	pc, err := precis.UsernameCaseMapped.String("BigBird")
	fmt.Printf("PRECIS on \"BigBird\": %q %v\n", pc, err)

	// four fakes of a real name, against each rule, in a real unique index
	run(c, "DROP TABLE IF EXISTS who")
	run(c, `CREATE TABLE who (username TEXT NOT NULL)`)
	run(c, "CREATE UNIQUE INDEX who_u ON who (lower(username))")
	fakes := []struct {
		label string
		make  func(string) string
	}{
		{"Cyrillic a", func(s string) string { return strings.Replace(s, "a", cyrillicA, 1) }},
		{"zero-width", func(s string) string { return s[:3] + zeroWidth + s[3:] }},
		{"trailing space", func(s string) string { return s + " " }},
		{"tiny capitals", toTiny},
	}
	fmt.Printf("%-16s %-16s %-14s %-11s %s\n", "1,000 fakes", "lower() index",
		"NFKC + lower", "PRECIS", "plain only")
	for _, fake := range fakes {
		var index, nfkc, pre, plain int
		for i := 0; i < 1000; i++ {
			real := "a" + name(uint64(i)) // always has an "a" to swap
			f := fake.make(real)
			run(c, "INSERT INTO who VALUES ($1)", real)
			if _, err := c.Exec(ctx, "INSERT INTO who VALUES ($1)", f); err == nil {
				index++
			}
			if cleanRight(f) != real {
				nfkc++
			}
			if out, err := precis.UsernameCaseMapped.String(f); err == nil && out != real {
				pre++
			}
			if plainName.MatchString(f) {
				plain++
			}
			run(c, "DELETE FROM who")
		}
		fmt.Printf("%-16s %-16d %-14d %-11d %d\n", fake.label, index, nfkc, pre, plain)
	}
	run(c, "DROP TABLE who")
	fmt.Println("(a number is how many fakes got through as a new name)")
	fmt.Printf("Turkish: Go lower(\"İ\") = %q, ", strings.ToLower("İ"))
	fmt.Printf("Postgres lower('İ') = %q, ", one[string](c, "SELECT lower('İ')"))
	fmt.Printf("Postgres lower('İ' COLLATE \"tr-x-icu\") = %q, ",
		one[string](c, `SELECT lower('İ' COLLATE "tr-x-icu")`))
	fmt.Printf("lower('I' COLLATE \"tr-x-icu\") = %q\n",
		one[string](c, `SELECT lower('I' COLLATE "tr-x-icu")`))
}

// One account per cleaned name: a miniature of the system in Spotify's write-up.
const accountsTable = `CREATE TABLE accounts (
  canonical TEXT PRIMARY KEY,
  email     TEXT NOT NULL,
  password  TEXT NOT NULL
)`

type clean func(string) string

// signUp stores the cleaned name. Refused only if that is already taken.
func signUp(c *pgx.Conn, f clean, typed, email string) bool {
	_, err := c.Exec(ctx, "INSERT INTO accounts VALUES ($1, $2, 'mine')", f(typed), email)
	return err == nil
}

// resetPassword: the email goes to the account found by cleaning the name;
// the new password is saved by cleaning that account's name again.
func resetPassword(c *pgx.Conn, f clean, typed, newPassword string) {
	found := f(typed)
	var canonical string
	if err := c.QueryRow(ctx, "SELECT canonical FROM accounts WHERE canonical = $1",
		found).Scan(&canonical); err != nil {
		return
	}
	run(c, "UPDATE accounts SET password = $1 WHERE canonical = $2",
		newPassword, f(canonical))
}

// guarded refuses a name that isn't stable, the check Spotify added.
func guarded(c *pgx.Conn, f clean, typed, email string) bool {
	if f(f(typed)) != f(typed) {
		return false
	}
	return signUp(c, f, typed, email)
}

func takeover(c *pgx.Conn) {
	const n = 1000
	for _, t := range []struct {
		label string
		f     clean
		up    func(*pgx.Conn, clean, string, string) bool
	}{
		{"wrong order", cleanWrong, signUp},
		{"wrong order, guarded", cleanWrong, guarded},
		{"right order", cleanRight, signUp},
	} {
		run(c, "DROP TABLE IF EXISTS accounts")
		run(c, accountsTable)
		registered, stolen := 0, 0
		for i := 0; i < n; i++ {
			victim := toPlain(name(uint64(i)))
			signUp(c, t.f, victim, "victim@example.com")
			fake := toTiny(victim)
			if t.up(c, t.f, fake, "attacker@example.com") {
				registered++
				resetPassword(c, t.f, fake, "stolen")
			}
			if one[string](c, "SELECT password FROM accounts WHERE canonical = $1",
				t.f(victim)) == "stolen" {
				stolen++
			}
		}
		fmt.Printf("%-22s fake name accepted %4d of %d, victim's password "+
			"changed %4d\n", t.label, registered, n, stolen)
	}
	run(c, "DROP TABLE accounts")
}

// toPlain keeps only the letters that have a tiny capital, so a fake is complete.
func toPlain(s string) string {
	return strings.Map(func(r rune) rune {
		if _, ok := tiny[r]; ok {
			return r
		}
		return 'a'
	}, s)
}
