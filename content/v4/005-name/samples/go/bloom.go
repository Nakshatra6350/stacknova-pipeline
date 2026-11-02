package main

import (
	"hash/maphash"
	"math"
	"sync/atomic"
)

// Bloom is a row of bits and k positions per name. It never stores a name.
type Bloom struct {
	bits []uint64
	m, k uint64
	a, b maphash.Seed
}

func NewBloom(m, k uint64) *Bloom {
	return &Bloom{bits: make([]uint64, (m+63)/64), m: m, k: k,
		a: maphash.MakeSeed(), b: maphash.MakeSeed()}
}

// bit i of a name: two hashes stand in for k (Kirsch, Mitzenmacher, 2006).
func (f *Bloom) bit(h1, h2, i uint64) (word, mask uint64) {
	p := (h1 + i*h2) % f.m
	return p / 64, 1 << (p % 64)
}

func (f *Bloom) hashes(name string) (h1, h2 uint64) {
	return maphash.String(f.a, name), maphash.String(f.b, name) | 1
}

// Add turns on the name's k bits.
func (f *Bloom) Add(name string) {
	h1, h2 := f.hashes(name)
	for i := uint64(0); i < f.k; i++ {
		w, mask := f.bit(h1, h2, i)
		atomic.OrUint64(&f.bits[w], mask)
	}
}

// Has is false only if the name was never added. True means maybe.
func (f *Bloom) Has(name string) bool {
	h1, h2 := f.hashes(name)
	for i := uint64(0); i < f.k; i++ {
		w, mask := f.bit(h1, h2, i)
		if atomic.LoadUint64(&f.bits[w])&mask == 0 {
			return false // one bit off: certainly never added
		}
	}
	return true // all on, maybe set by other names: ask the database
}

// Clear turns off the name's k bits: the "delete" that breaks the filter.
func (f *Bloom) Clear(name string) {
	h1, h2 := f.hashes(name)
	for i := uint64(0); i < f.k; i++ {
		w, mask := f.bit(h1, h2, i)
		f.bits[w] &^= mask
	}
}

// The false-positive rate the maths predicts: (1 - e^(-kn/m))^k.
func predicted(m, n, k uint64) float64 {
	fill := 1 - math.Exp(-float64(k)*float64(n)/float64(m))
	return math.Pow(fill, float64(k))
}
