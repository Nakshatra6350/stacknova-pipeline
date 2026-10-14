package payments

import (
	"bytes"
	"crypto/rand"
	"net/http"
	"time"
)

// CreatePayment sends one payment, retrying when no answer comes back. The idempotency key
// is made once, before the first attempt, and every attempt carries the same key, so the
// server can tell a retry from a new payment. Shown in segment s05 of episode 001.
//
// It retries only on silence (an error with no response). Real clients also retry some
// answers, such as 409 or 503, with the same key. http.NewRequest fails only on a malformed
// method or URL; the caller passes a fixed URL, so that error is dropped to keep the listing
// on screen short.
func CreatePayment(c *http.Client, url string, b []byte) (*http.Response, error) {
	key := rand.Text() // once, before the first try
	for attempt := 0; ; attempt++ {
		req, _ := http.NewRequest("POST", url, bytes.NewReader(b))
		req.Header.Set("Idempotency-Key", key)
		resp, err := c.Do(req)
		if err == nil || attempt == 2 {
			return resp, err // an answer, or out of tries
		}
		time.Sleep(time.Second << attempt) // 1 s, then 2 s
	}
}
