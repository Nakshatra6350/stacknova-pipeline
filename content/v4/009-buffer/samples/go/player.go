package main

import "math"

// A ladder: the same film made at several qualities, cut into pieces of the
// same length. sizes[q][i] is piece i at quality q, in bytes, from real files.
type Ladder struct {
	Name    []string
	Kbps    []float64 // what each quality was made for
	Sizes   [][]float64
	Seconds float64 // the length of one piece
}

// A connection: how many kilobits a second it gives, second by second.
type Network []float64

// download returns how long a piece of `bytes` takes from second `at`.
func (n Network) download(at, bytes float64) float64 {
	left := bytes * 8 / 1000 // kilobits
	t := at
	for left > 0 {
		sec := int(t)
		rate := n[sec%len(n)]
		room := (float64(sec+1) - t) * rate
		if room >= left {
			t += left / rate
			break
		}
		left -= room
		t = float64(sec + 1)
	}
	return t - at + 0.05 // plus a round trip
}

// A picker chooses the next quality. It sees what any real player sees: how
// much is buffered, and how fast recent pieces came.
type Picker interface {
	Pick(buffer float64, recentKbps []float64, ladder *Ladder, next int) int
}

// RateBased: estimate the speed from the last few pieces, take the best that fits.
type RateBased struct{ Safety float64 }

func (p RateBased) Pick(_ float64, recent []float64, l *Ladder, _ int) int {
	if len(recent) == 0 {
		return 0
	}
	from := max(0, len(recent)-5)
	inv := 0.0 // harmonic mean: one slow piece pulls it down
	for _, k := range recent[from:] {
		inv += 1 / k
	}
	estimate := float64(len(recent)-from) / inv * p.Safety
	q := 0
	for i, k := range l.Kbps {
		if k <= estimate {
			q = i
		}
	}
	return q
}

// BufferBased: the quality follows the buffer. Below the reservoir, the
// lowest; above reservoir + cushion, the highest; a straight line between.
type BufferBased struct{ Reservoir, Cushion float64 }

func (p BufferBased) Pick(buffer float64, _ []float64, l *Ladder, _ int) int {
	top := len(l.Kbps) - 1
	if buffer <= p.Reservoir {
		return 0
	}
	if buffer >= p.Reservoir+p.Cushion {
		return top
	}
	share := (buffer - p.Reservoir) / p.Cushion
	want := l.Kbps[0] + share*(l.Kbps[top]-l.Kbps[0])
	q := 0
	for i, k := range l.Kbps {
		if k <= want {
			q = i
		}
	}
	return q
}

// BufferStart is the buffer-based picker with a quick start: while the buffer
// is still filling for the first time, step up one quality whenever the last
// piece came at least twice as fast as the next quality needs. The SIGCOMM
// paper found estimates unnecessary in steady state, and useful in startup.
type BufferStart struct {
	BufferBased
	started bool
	q       int
	last    float64
}

func (p *BufferStart) Pick(buffer float64, recent []float64, l *Ladder, next int) int {
	byBuffer := p.BufferBased.Pick(buffer, recent, l, next)
	// the start is over once the buffer stops growing, or the map catches up
	if p.started || byBuffer > p.q || buffer < p.last {
		p.started = true
		return byBuffer
	}
	p.last = buffer
	if len(recent) > 0 && p.q+1 < len(l.Kbps) && recent[len(recent)-1] >= 2*l.Kbps[p.q+1] {
		p.q++
	}
	return max(p.q, byBuffer)
}

// Fixed always asks for one quality.
type Fixed struct{ Q int }

func (p Fixed) Pick(float64, []float64, *Ladder, int) int { return p.Q }

// Result is what a person watching would notice.
type Result struct {
	Stalls     int     // times the picture froze after it started
	StallSecs  float64 // how long it was frozen, in total
	Startup    float64 // seconds before the first frame
	AvgKbps    float64 // the quality they saw, on average
	Switches   int     // quality changes
	HighShare  float64 // share of time at the top quality
	LowestUsed int
}

// Play watches `pieces` pieces over a network, with a buffer of at most maxBuf s.
func Play(l *Ladder, n Network, p Picker, pieces int, maxBuf float64) Result {
	var r Result
	clock, buffer := 0.0, 0.0
	playing := false
	var recent []float64
	last := -1
	kbpsSum := 0.0
	r.LowestUsed = math.MaxInt
	for i := 0; i < pieces; i++ {
		// a full buffer: wait for room, as real players do
		if buffer > maxBuf-l.Seconds {
			wait := buffer - (maxBuf - l.Seconds)
			clock += wait
			buffer -= wait
		}
		q := p.Pick(buffer, recent, l, i)
		size := l.Sizes[q][i%len(l.Sizes[q])]
		took := n.download(clock, size)
		clock += took
		if playing {
			if took > buffer {
				r.Stalls++
				r.StallSecs += took - buffer
				buffer = 0
			} else {
				buffer -= took
			}
		}
		buffer += l.Seconds
		if !playing {
			playing = true
			r.Startup = clock
		}
		recent = append(recent, size*8/1000/took)
		if last >= 0 && q != last {
			r.Switches++
		}
		last = q
		kbpsSum += l.Kbps[q]
		if q == len(l.Kbps)-1 {
			r.HighShare++
		}
		r.LowestUsed = min(r.LowestUsed, q)
	}
	r.AvgKbps = kbpsSum / float64(pieces)
	r.HighShare /= float64(pieces)
	return r
}
