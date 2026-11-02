package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	mrand "math/rand"
	"time"
)

// newToken is what goes in the email: 256 random bits, from the OS.
func newToken() string {
	b := make([]byte, 32)
	rand.Read(b) // never returns an error (crypto/rand docs)
	return base64.RawURLEncoding.EncodeToString(b)
}

// hashToken is what goes in the database. One fast hash is right here:
// a slow one protects guessable passwords, and 256 random bits can't be guessed.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// weakToken is the one most of us would never write on purpose, but people do:
// a random number generator seeded with the time.
func weakToken(at time.Time) string {
	r := mrand.New(mrand.NewSource(at.UnixMilli()))
	b := make([]byte, 16)
	r.Read(b)
	return hex.EncodeToString(b)
}
