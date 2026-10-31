// The tests that need no server: a person typing, clocks that disagree,
// someone guessing, and a secret made with the wrong random numbers.
package main

import (
	"crypto/sha1"
	"encoding/binary"
	"fmt"
	mrand "math/rand"
	"math/rand/v2"
	"slices"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// typing is n people reading a code at a random moment, then taking 4 to 12
// seconds to type it and tap. It returns how many are refused.
func typing(n, window int) int {
	refused := 0
	base := time.Now()
	for range n {
		secret := NewSecret()
		read := base.Add(rand.N(30 * time.Second))
		sent := read.Add(4*time.Second + rand.N(8*time.Second))
		if _, ok := match(secret, Code(secret, read), sent, window); !ok {
			refused++
		}
	}
	return refused
}

// accepted is the share of n logins accepted when the phone's clock is off
// by drift: at a random moment, with no time spent typing.
func accepted(n, window int, drift time.Duration) float64 {
	ok := 0
	base := time.Now()
	for range n {
		secret := NewSecret()
		now := base.Add(rand.N(30 * time.Second))
		if _, in := match(secret, Code(secret, now.Add(drift)), now,
			window); in {
			ok++
		}
	}
	return 100 * float64(ok) / float64(n)
}

// attack is someone with the password guessing codes at one account: burst
// guesses, then a wait, until a guess lands or the time runs out. Guesses
// are random. The server accepts 3 codes at a time (window 1). It returns
// the seconds it took, or -1. stopAfter > 0 ends it after that many guesses:
// the server disables the code login.
func attack(perBurst int, wait, limit time.Duration, stopAfter int) float64 {
	secret := NewSecret()
	t := time.Now()
	began, tried := t, 0
	for t.Sub(began) < limit {
		s := stepAt(t)
		live := [3]int{}
		for i := range live {
			code := hotp(sha1.New, secret, uint64(s+int64(i)-1), 6)
			live[i], _ = strconv.Atoi(code)
		}
		for range perBurst {
			guess := rand.IntN(1_000_000)
			tried++
			if guess == live[0] || guess == live[1] || guess == live[2] {
				return t.Sub(began).Seconds()
			}
			if stopAfter > 0 && tried >= stopAfter {
				return -1
			}
		}
		t = t.Add(wait)
	}
	return -1
}

// brute attacks n accounts at once and prints what got through.
func brute(name string, n, perBurst int, wait, limit time.Duration,
	stopAfter int) {
	took := make([]float64, 0, n)
	var mu sync.Mutex
	var wg sync.WaitGroup
	slots := make(chan struct{}, 16)
	for range n {
		wg.Add(1)
		slots <- struct{}{}
		go func() {
			defer func() { <-slots; wg.Done() }()
			if s := attack(perBurst, wait, limit, stopAfter); s >= 0 {
				mu.Lock()
				took = append(took, s)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	slices.Sort(took)
	fmt.Printf("%s: %d accounts attacked for up to %v, %d broken into\n",
		name, n, limit, len(took))
	if len(took) > 0 {
		fmt.Printf("  median %.0f min · slowest %.1f h\n",
			took[len(took)/2]/60, took[len(took)-1]/3600)
	}
}

// weakSecret is the bug: a secret from math/rand, seeded with the clock.
func weakSecret(signup int64) []byte {
	r := mrand.New(mrand.NewSource(signup))
	secret := make([]byte, 20)
	binary.BigEndian.PutUint64(secret, r.Uint64())
	binary.BigEndian.PutUint64(secret[8:], r.Uint64())
	binary.BigEndian.PutUint32(secret[16:], r.Uint32())
	return secret
}

// recoverSecret is the attacker: two codes seen from one account, and the
// hour it signed up. It tries every second of that hour as the seed.
func recoverSecret(a, b string, at time.Time, hour int64) bool {
	for seed := hour; seed < hour+3600; seed++ {
		guess := weakSecret(seed)
		if Code(guess, at) == a && Code(guess, at.Add(30*time.Second)) == b {
			return true
		}
	}
	return false
}

// secretsTest counts the secrets an attacker recovers from two codes each.
func secretsTest(name string, n int, weak bool) {
	var found atomic.Int64
	var wg sync.WaitGroup
	slots := make(chan struct{}, 16)
	at := time.Now()
	hour := at.Unix() - at.Unix()%3600
	for range n {
		wg.Add(1)
		slots <- struct{}{}
		go func() {
			defer func() { <-slots; wg.Done() }()
			secret := NewSecret()
			if weak {
				secret = weakSecret(hour + rand.Int64N(3600))
			}
			a, b := Code(secret, at), Code(secret, at.Add(30*time.Second))
			if recoverSecret(a, b, at, hour) {
				found.Add(1)
			}
		}()
	}
	wg.Wait()
	fmt.Printf("%s: %d accounts, %d secrets recovered from 2 codes each\n",
		name, n, found.Load())
}
