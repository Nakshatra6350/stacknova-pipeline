package main

// Every run uses the same made-up usernames, and no two are alike: multiplying
// by an odd number modulo 2^40 never repeats, and neither does x ^= x >> 20.
// So name(i) is different for every i, and any i past the last one loaded is
// a name that is certainly free.
const scramble = 0x9E3779B97F
const mask40 = 1<<40 - 1

var syllables = func() (out [64]string) {
	for i, c := range "bdfghjklmnprstvz" {
		for j, v := range "aeio" {
			out[i*4+j] = string(c) + string(v)
		}
	}
	return out
}()

func name(i uint64) string {
	x := (i * scramble) & mask40
	x ^= x >> 20
	x = (x * scramble) & mask40
	b := make([]byte, 0, 14)
	for s := 0; s < 6; s++ {
		b = append(b, syllables[x&63]...)
		x >>= 6
	}
	return string(append(b, "0123456789abcdef"[x]))
}
