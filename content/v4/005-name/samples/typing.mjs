// The green tick in the browser: every keystroke asks, and replies come back
// out of order. Real timers and real HTTP against a local server whose replies
// take 20 to 400 ms. Someone types "stacknova": every shorter name is taken, the
// whole name is free, so the right answer at the end is always "free".
//
//   node typing.mjs
import http from "node:http";

const TYPED = "stacknova";
const ROUNDS = 1000, AT_ONCE = 100;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const between = (lo, hi) => lo + Math.random() * (hi - lo);

let requests = 0;
const server = http.createServer(async (req, res) => {
  requests++;
  await wait(between(20, 400));
  const name = new URL(req.url, "http://x").searchParams.get("name");
  res.end(name.length < TYPED.length ? "taken" : "free");
});
await new Promise((up) => server.listen(0, "127.0.0.1", up));
const url = `http://127.0.0.1:${server.address().port}/check?name=`;

// 1: every keystroke asks, and whichever reply lands last is what you see
function everyKey() {
  const field = { shown: null };
  field.onKey = (text) => {
    fetch(url + text).then((r) => r.text()).then((a) => { field.shown = a; });
  };
  return field;
}

// 2: wait for a pause in the typing before asking
function debounced() {
  const field = { shown: null };
  let timer;
  field.onKey = (text) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fetch(url + text).then((r) => r.text()).then((a) => { field.shown = a; });
    }, 250);
  };
  return field;
}

// 3: the pause, and each new key cancels the question before it
function debouncedAndCancelled() {
  const field = { shown: null };
  let timer, asking;
  field.onKey = (text) => {
    clearTimeout(timer);
    asking?.abort();              // the old answer can't land now
    asking = new AbortController();
    const { signal } = asking;
    field.shown = null;           // no tick while the text is unchecked
    timer = setTimeout(async () => {
      const reply = await fetch(url + text, { signal });
      field.shown = await reply.text();
    }, 250);
  };
  return field;
}

// someone typing: 120 ms a key, and now and then a pause to think
async function type(field) {
  for (let n = 1; n <= TYPED.length; n++) {
    field.onKey(TYPED.slice(0, n));
    await wait(Math.random() < 0.25 ? between(300, 600) : 120);
  }
  await wait(1000); // every reply has landed by now
}

process.on("unhandledRejection", (e) => {
  if (e.name !== "AbortError") throw e;
});

for (const [label, make] of [["every key", everyKey], ["debounce", debounced],
                             ["debounce + cancel", debouncedAndCancelled]]) {
  requests = 0;
  let wrong = 0;
  for (let done = 0; done < ROUNDS; done += AT_ONCE) {
    const fields = Array.from({ length: AT_ONCE }, make);
    await Promise.all(fields.map(type));
    wrong += fields.filter((f) => f.shown !== "free").length;
  }
  console.log(`${label.padEnd(18)} ${(requests / ROUNDS).toFixed(1)} requests a name, ` +
              `wrong answer left on screen: ${wrong} of ${ROUNDS}`);
}
server.close();
process.exit(0);
