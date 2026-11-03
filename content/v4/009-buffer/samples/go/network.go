package main

import (
	"math"
	"math/rand"
)

// A bumpy connection, made up but shaped like a phone on the move: a typical
// speed for the session, wandering a little every few seconds, and now and
// then a dip (a lift, a tunnel, a crowded cell) for a few seconds.
// These are simulated. The pieces they carry are real.
func bumpy(seed int64, seconds int) Network {
	r := rand.New(rand.NewSource(seed))
	typical := 1200 + r.Float64()*6800 // 1.2 to 8 Mbps for this session
	n := make(Network, seconds)
	level := typical
	for s := 0; s < seconds; {
		span := 2 + r.Intn(8)
		level = typical * math.Exp(r.NormFloat64()*0.45)
		if r.Float64() < 0.06 { // a dip
			level = 150 + r.Float64()*350
			span = 3 + r.Intn(10)
		}
		for i := 0; i < span && s < seconds; i, s = i+1, s+1 {
			// second to second, measurements jitter around the level
			n[s] = math.Max(80, level*(0.75+r.Float64()*0.5))
		}
	}
	return n
}

// steady is a connection that never changes.
func steady(kbps float64, seconds int) Network {
	n := make(Network, seconds)
	for i := range n {
		n[i] = kbps
	}
	return n
}
