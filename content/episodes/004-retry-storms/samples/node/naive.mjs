// The retry most of us write first: on any error, try again at once, up to three times.
// Episode 004 — "Retry storms". Shown in segment s02.
export async function callNaive(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt === 3) throw err; // three tries, no pause
    }
  }
}
