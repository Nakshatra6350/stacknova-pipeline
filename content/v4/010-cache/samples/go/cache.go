package main

import (
	"math"
	"math/rand/v2"
	"sync"
	"time"
)

// Load fetches the real value: here, a product's rating from the database.
type Load func() (Summary, error)

// An entry is a cached value and the moment it stops being fresh.
type entry struct {
	value   Summary
	expires time.Time
}

// Naive: on a miss, every caller loads the value itself.
type Naive struct {
	mu   sync.Mutex
	data map[string]entry
	ttl  time.Duration
}

func (c *Naive) Get(key string, load Load) (Summary, error) {
	c.mu.Lock()
	e, ok := c.data[key]
	c.mu.Unlock()
	if ok && time.Now().Before(e.expires) {
		return e.value, nil
	}
	v, err := load() // every caller that missed gets here: the stampede
	if err != nil {
		return v, err
	}
	c.mu.Lock()
	c.data[key] = entry{v, time.Now().Add(c.ttl)}
	c.mu.Unlock()
	return v, nil
}

// A call is one load in progress. Everyone after the same key waits on it.
type call struct {
	done  chan struct{}
	value Summary
	err   error
}

// Flight: on a miss, the first caller loads; the rest wait for its answer.
type Flight struct {
	mu       sync.Mutex
	data     map[string]entry
	inflight map[string]*call
	ttl      time.Duration
}

func (c *Flight) Get(key string, load Load) (Summary, error) {
	c.mu.Lock()
	if e, ok := c.data[key]; ok && time.Now().Before(e.expires) {
		c.mu.Unlock()
		return e.value, nil
	}
	if cl, ok := c.inflight[key]; ok { // someone is already asking
		c.mu.Unlock()
		<-cl.done
		return cl.value, cl.err
	}
	cl := &call{done: make(chan struct{})}
	c.inflight[key] = cl
	c.mu.Unlock()

	cl.value, cl.err = load()
	c.mu.Lock()
	if cl.err == nil {
		c.data[key] = entry{cl.value, time.Now().Add(c.ttl)}
	}
	delete(c.inflight, key)
	c.mu.Unlock()
	close(cl.done) // wakes every waiter at once
	return cl.value, cl.err
}

// Stale: an expired value is still served while one caller refreshes it.
type Stale struct {
	mu         sync.Mutex
	data       map[string]entry
	refreshing map[string]bool
	ttl        time.Duration
	maxStale   time.Duration // older than this, and callers wait instead
	cold       *Flight       // nothing to serve yet: wait like Flight
}

func (c *Stale) Get(key string, load Load) (Summary, error) {
	c.mu.Lock()
	e, ok := c.data[key]
	now := time.Now()
	if ok && now.After(e.expires) && !c.refreshing[key] {
		c.refreshing[key] = true
		go c.refresh(key, load) // one refresh, in the background
	}
	c.mu.Unlock()
	if ok && now.Before(e.expires.Add(c.maxStale)) {
		return e.value, nil // fresh, or stale but still allowed
	}
	v, err := c.cold.Get(key, load)
	if err == nil {
		c.mu.Lock()
		c.data[key] = entry{v, time.Now().Add(c.ttl)}
		c.mu.Unlock()
	}
	return v, err
}

func (c *Stale) refresh(key string, load Load) {
	v, err := load()
	c.mu.Lock()
	defer c.mu.Unlock()
	if err == nil { // on an error, keep serving the old value
		c.data[key] = entry{v, time.Now().Add(c.ttl)}
	}
	delete(c.refreshing, key)
}

// jitter spreads expiry times: base, plus or minus frac of it.
func jitter(base time.Duration, frac float64, r *rand.Rand) time.Duration {
	return base + time.Duration((r.Float64()*2-1)*frac*float64(base))
}

// early is the XFetch rule (Vattani et al., VLDB 2015): refresh before the
// value expires, with a chance that grows as expiry gets near. delta is
// how long a load takes; beta above 1 refreshes earlier.
func early(expires, now time.Time, delta time.Duration, beta float64,
	r *rand.Rand) bool {
	ahead := -float64(delta) * beta * math.Log(r.Float64())
	return !now.Add(time.Duration(ahead)).Before(expires)
}
