// Why your video doesn't buffer (look v4 #9): a film cut into 4-second pieces
// at five qualities by ffmpeg, and a player choosing one piece at a time. The
// pieces and their sizes are real; the connections are simulated, and seeded.
//
//	go run . -mode=ladder     // what the real pieces weigh
//	go run . -mode=pickers    // speed-based against buffer-based, 1,000 sessions
//	go run . -mode=noise      // how wrong a speed estimate is, one piece ahead
//	go run . -mode=startup    // the first frame: start low, or start high
//	go run . -mode=maxbuffer  // how much buffer is worth having
//	go run . -mode=cushion    // the buffer-based picker's two settings
//	go run . -mode=steady     // a connection that never changes
//	go run . -mode=content    // same quality setting, two kinds of film
//
// Needs the pieces from encode.sh in ./pieces (or PIECES).
package main

import (
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var ladderNames = []string{"270p", "360p", "540p", "720p", "1080p"}
var ladderKbps = []float64{300, 750, 1500, 3000, 5800}

func loadLadder(dir string) *Ladder {
	l := &Ladder{Name: ladderNames, Kbps: ladderKbps, Seconds: 4}
	for _, name := range ladderNames {
		files, err := filepath.Glob(filepath.Join(dir, name, "piece-*.ts"))
		if err != nil || len(files) == 0 {
			log.Fatalf("no pieces in %s/%s: run encode.sh", dir, name)
		}
		sort.Strings(files)
		var sizes []float64
		for _, f := range files[:len(files)-1] { // the last piece is short
			st, err := os.Stat(f)
			if err != nil {
				log.Fatal(err)
			}
			sizes = append(sizes, float64(st.Size()))
		}
		l.Sizes = append(l.Sizes, sizes)
	}
	return l
}

const sessions, pieces = 1000, 150 // 150 pieces of 4 s: a 10-minute watch

type contender struct {
	label string
	p     func() Picker // a fresh one for each session
}

var contenders = []contender{
	{"always 1080p", func() Picker { return Fixed{4} }},
	{"speed-based", func() Picker { return RateBased{Safety: 0.9} }},
	{"buffer-based", func() Picker { return BufferBased{Reservoir: 8, Cushion: 30} }},
	{"buffer + start", func() Picker {
		return &BufferStart{BufferBased: BufferBased{Reservoir: 8, Cushion: 30}}
	}},
}

func summary(label string, rs []Result) {
	var stalls, stalled, secs, kbps, sw, high, startup float64
	for _, r := range rs {
		stalls += float64(r.Stalls)
		if r.Stalls > 0 {
			stalled++
		}
		secs += r.StallSecs
		kbps += r.AvgKbps
		sw += float64(r.Switches)
		high += r.HighShare
		startup += r.Startup
	}
	n := float64(len(rs))
	fmt.Printf("%-16s stalls %5.0f, sessions with a stall %4.0f, frozen %6.0f s, "+
		"avg %4.0f kbps, top quality %3.0f%%, switches %4.1f a session, start %.1f s\n",
		label, stalls, stalled, secs, kbps/n, high/n*100, sw/n, startup/n)
}

func pickers(l *Ladder) {
	fmt.Printf("%d sessions of 10 minutes, the same %d bumpy connections for each player, buffer up to 60 s\n",
		sessions, sessions)
	for _, c := range contenders {
		rs := make([]Result, sessions)
		for s := 0; s < sessions; s++ {
			rs[s] = Play(l, bumpy(int64(s), 1200), c.p(), pieces, 60)
		}
		summary(c.label, rs)
	}
}

func noise() {
	// How far off is "the last 5 pieces' speed" from the next piece's speed?
	over50, under50, n := 0, 0, 0
	for s := 0; s < sessions; s++ {
		net := bumpy(int64(s), 1200)
		for t := 20; t < 1100; t += 4 {
			inv := 0.0
			for k := 1; k <= 5; k++ {
				inv += 1 / net[t-4*k]
			}
			est := 5 / inv
			actual := (net[t] + net[t+1] + net[t+2] + net[t+3]) / 4
			n++
			if est > actual*1.5 {
				over50++
			}
			if est < actual/1.5 {
				under50++
			}
		}
	}
	fmt.Printf("estimate from the last 5 pieces, against the next piece: "+
		"too high by over 50%% in %.1f%% of pieces, too low by over 50%% in %.1f%%\n",
		float64(over50)*100/float64(n), float64(under50)*100/float64(n))
}

func startup(l *Ladder) {
	for q := range l.Kbps {
		total := 0.0
		for s := 0; s < sessions; s++ {
			total += Play(l, bumpy(int64(s), 1200), Fixed{q}, 1, 60).Startup
		}
		fmt.Printf("first piece at %-5s: first frame after %.2f s on average\n",
			l.Name[q], total/sessions)
	}
}

func maxBuffer(l *Ladder) {
	for _, mb := range []float64{12, 30, 60, 120} {
		rs := make([]Result, sessions)
		for s := 0; s < sessions; s++ {
			// the same shape at every size: reserve 15%, cushion 50%
			p := BufferBased{Reservoir: 0.15 * mb, Cushion: 0.5 * mb}
			rs[s] = Play(l, bumpy(int64(s), 1200), p, pieces, mb)
		}
		summary(fmt.Sprintf("buffer up to %3.0f s", mb), rs)
	}
}

func cushion(l *Ladder) {
	for _, rc := range [][2]float64{{4, 10}, {8, 30}, {16, 30}, {8, 45}} {
		rs := make([]Result, sessions)
		for s := 0; s < sessions; s++ {
			rs[s] = Play(l, bumpy(int64(s), 1200), BufferBased{Reservoir: rc[0], Cushion: rc[1]}, pieces, 60)
		}
		summary(fmt.Sprintf("reserve %2.0f, cushion %2.0f", rc[0], rc[1]), rs)
	}
}

func steadyCase(l *Ladder) {
	for _, kbps := range []float64{2000, 6500} {
		for _, c := range contenders[1:] {
			r := Play(l, steady(kbps, 1200), c.p(), pieces, 60)
			fmt.Printf("steady %4.0f kbps, %-13s stalls %d, avg %4.0f kbps, switches %d\n",
				kbps, c.label, r.Stalls, r.AvgKbps, r.Switches)
		}
	}
}

func ladderInfo(l *Ladder) {
	for q, sizes := range l.Sizes {
		lo, hi, sum := sizes[0], sizes[0], 0.0
		for _, s := range sizes {
			lo, hi, sum = math.Min(lo, s), math.Max(hi, s), sum+s
		}
		avg := sum / float64(len(sizes))
		fmt.Printf("%-5s made for %4.0f kbps: %d pieces, average %4.0f kbps, smallest %4.0f, "+
			"largest %4.0f (%.1fx the smallest)\n", l.Name[q], l.Kbps[q], len(sizes),
			avg*8/1000/l.Seconds, lo*8/1000/l.Seconds, hi*8/1000/l.Seconds, hi/lo)
	}
}

func content(dir string) {
	data, err := os.ReadFile(filepath.Join(dir, "content.txt"))
	if err != nil {
		log.Fatal("run encode.sh first: ", err)
	}
	fmt.Print(strings.TrimSpace(string(data)) + "\n")
}

func main() {
	mode := flag.String("mode", "pickers", "which test")
	flag.Parse()
	dir := os.Getenv("PIECES")
	if dir == "" {
		dir = "pieces"
	}
	switch *mode {
	case "noise":
		noise()
		return
	case "content":
		content(dir)
		return
	}
	l := loadLadder(dir)
	switch *mode {
	case "ladder":
		ladderInfo(l)
	case "pickers":
		pickers(l)
	case "startup":
		startup(l)
	case "maxbuffer":
		maxBuffer(l)
	case "cushion":
		cushion(l)
	case "steady":
		steadyCase(l)
	default:
		log.Fatalf("no mode %q", *mode)
	}
}
