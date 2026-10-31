// TOTP (RFC 6238), everything the phone and the server both run. No network:
// a secret and the time go in, six digits come out.
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"hash"
	"net/url"
	"time"
)

var pow10 = map[int]uint32{6: 1_000_000, 8: 100_000_000}

// hotp is RFC 4226: a secret and a counter become a short number.
func hotp(h func() hash.Hash, secret []byte, counter uint64,
	digits int) string {
	mac := hmac.New(h, secret)
	mac.Write(binary.BigEndian.AppendUint64(nil, counter))
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f // the last 4 bits pick a place in the sum
	n := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	return fmt.Sprintf("%0*d", digits, n%pow10[digits])
}

// stepAt is the counter TOTP adds to HOTP: the time, in 30-second steps.
func stepAt(t time.Time) int64 { return t.Unix() / 30 }

// Code is TOTP with the defaults authenticator apps use: SHA-1, a 30-second
// step and 6 digits.
func Code(secret []byte, t time.Time) string {
	return hotp(sha1.New, secret, uint64(stepAt(t)), 6)
}

// match looks for the code in the steps around now and returns the step it
// belongs to. window 1 accepts the step before and the step after.
func match(secret []byte, code string, now time.Time,
	window int) (int64, bool) {
	s := stepAt(now)
	for d := -window; d <= window; d++ {
		step := s + int64(d)
		want := hotp(sha1.New, secret, uint64(step), 6)
		if subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return step, true
		}
	}
	return 0, false
}

// NewSecret makes a secret: 160 random bits, the length RFC 4226 recommends.
func NewSecret() []byte {
	secret := make([]byte, 20)
	rand.Read(secret) // crypto/rand, never math/rand
	return secret
}

var base32NoPad = base32.StdEncoding.WithPadding(base32.NoPadding)

// EnrolURI is what the QR code holds: the secret, in Base32, in a key URI.
func EnrolURI(issuer, account string, secret []byte) string {
	q := url.Values{"secret": {base32NoPad.EncodeToString(secret)},
		"issuer": {issuer}}
	return fmt.Sprintf("otpauth://totp/%s:%s?%s", url.PathEscape(issuer),
		url.PathEscape(account), q.Encode())
}

// newSealer makes the AES-256-GCM cipher that seals secrets. The key lives
// outside the database: a key service, or an environment variable.
func newSealer(key []byte) cipher.AEAD {
	block, err := aes.NewCipher(key)
	if err != nil {
		panic(err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		panic(err)
	}
	return aead
}

// label is the additional data of a sealed secret: with it, a sealed secret
// only opens for the account it was sealed for.
func label(account int64) []byte {
	return binary.BigEndian.AppendUint64(nil, uint64(account))
}

// seal encrypts a secret for the table: nonce + ciphertext + tag.
func seal(aead cipher.AEAD, secret, data []byte) []byte {
	nonce := make([]byte, aead.NonceSize())
	rand.Read(nonce)
	return aead.Seal(nonce, nonce, secret, data)
}

// unseal gets the secret back, or fails if a byte or the account differs.
func unseal(aead cipher.AEAD, stored, data []byte) ([]byte, error) {
	n := aead.NonceSize()
	if len(stored) < n {
		return nil, fmt.Errorf("sealed secret too short")
	}
	return aead.Open(nil, stored[:n], stored[n:], data)
}
