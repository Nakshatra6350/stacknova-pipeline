// The nine scenes of Behind the Button #10, "One key expired, and the database got 1,000 queries"
// (content/v4/010-cache/script.yaml). Each scene runs from its line's start until the next line
// starts, and times its beats to its line's words. The numbers come from samples/go (go run .
// -mode=stampede and its neighbours, three runs on Postgres 16 with a pool of 20 connections).
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { Editor, Stamp, clamp, pop, ramp } from "../ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

const Chip: React.FC<{ y: number; color: string; show: number; big: string; text: string; small?: string }> =
  ({ y, color, show, big, text, small }) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", opacity: show, borderRadius: 26,
                  background: C.surface, border: `3px solid ${color}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 26 }}>
      <div style={{ font: `800 104px/1 "${FONT.mono}"`, letterSpacing: -5, color, whiteSpace: "nowrap" }}>{big}</div>
      <div>
        <div style={{ font: `800 38px/1.15 "${FONT.display}"`, color: C.text }}>{text}</div>
        {small && <div style={{ font: `700 25px "${FONT.mono}"`, color: C.muted, marginTop: 6 }}>{small}</div>}
      </div>
    </div>
  );

type CacheState = "fresh" | "expired" | "stale";
const STATE: Record<CacheState, [string, string]> = {
  fresh: [C.green, "fresh · 60 s"],
  expired: [C.red, "expired"],
  stale: [C.amber, "old, still served"],
};

/** The cache: one key, its value, and whether it's still fresh. */
export const CacheCard: React.FC<{ x: number; y: number; state: CacheState; show?: number }> = ({ x, y, state, show = 1 }) => {
  const [color, label] = STATE[state];
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 480, boxSizing: "border-box", borderRadius: 26, background: C.surface,
                  border: `3px solid ${color}`, padding: "18px 24px", opacity: show }}>
      <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>cache · rating:1</div>
      <div style={{ font: `800 64px "${FONT.display}"`, color: state === "expired" ? "#4b5566" : C.text, marginTop: 4,
                    textDecoration: state === "expired" ? `line-through 5px ${C.red}` : "none" }}>★ 4.20</div>
      <div style={{ display: "inline-block", marginTop: 8, borderRadius: 999, padding: "6px 18px", background: `${color}26`,
                    font: `800 28px "${FONT.mono}"`, color }}>{label}</div>
    </div>
  );
};

/** The database, and how many queries reached it. */
export const DbCard: React.FC<{ x: number; y: number; queries: number; note?: string; show?: number }> = ({ x, y, queries, note, show = 1 }) => {
  const color = queries > 20 ? C.red : queries > 0 ? C.amber : C.green;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 480, boxSizing: "border-box", borderRadius: 26, background: C.surface,
                  border: `3px solid ${color}`, padding: "18px 24px", opacity: show }}>
      <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>postgres · queries</div>
      <div style={{ font: `800 84px/1.05 "${FONT.mono}"`, letterSpacing: -4, color }}>{queries.toLocaleString("en-US")}</div>
      <div style={{ font: `700 24px "${FONT.mono}"`, color: C.muted, marginTop: 4 }}>{note ?? "each one: ~100 ms"}</div>
    </div>
  );
};

/** 1,000 requests, 50 x 20, each coloured by what it's doing. */
const Crowd: React.FC<{ y: number; color: (i: number) => string; label: string }> = ({ y, color, label }) => (
  <div style={{ position: "absolute", left: 40, top: y, width: 1000 }}>
    <div style={{ font: `700 28px "${FONT.mono}"`, color: C.muted, marginBottom: 12 }}>{label}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(50, 1fr)", gap: 6 }}>
      {Array.from({ length: 1000 }, (_, i) => <div key={i} style={{ height: 13, borderRadius: 7, background: color(i) }} />)}
    </div>
  </div>
);
const IDLE = "#263040";

/** The hook (and the loop's last frame). */
export const CacheTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["One key expired.", "1,000 queries at once."].map((t, n) => (
      <Big key={t} size={88} color={hot === n ? (n === 1 ? C.red : C.yellow) : C.text}
           style={{ marginBottom: 12, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const thousand = at(line, "1,000");
  const q = Math.round(interpolate(frame, [thousand - 4, thousand + 22], [0, 1000], clamp));
  return (
    <>
      <CacheTitle hot={frame >= thousand ? 1 : 0} />
      <CacheCard x={40} y={440} state="expired" />
      <DbCard x={560} y={440} queries={q} />
      <Crowd y={720} label="1,000 requests" color={(i) => (i < q ? C.red : IDLE)} />
    </>
  );
};

/** What one miss costs: the rating, counted from a million reviews. */
export const Query: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const million = at(line, "1"), tenth = at(line, "0.1"), cache = at(line, "cache");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={78}>The best-seller</Big>
        <div style={{ font: `800 60px "${FONT.display}"`, color: C.amber, marginTop: 14 }}>★★★★☆ 4.20
          <span style={{ font: `700 34px "${FONT.mono}"`, color: C.muted, marginLeft: 20, opacity: ramp(frame, million, 6) }}>1,000,000 reviews</span>
        </div>
      </div>
      <Editor file="every product page asks" y={400} enter={ramp(frame, million, 8)} lines={[
        { text: "SELECT count(*), avg(stars)", sql: true },
        { text: "FROM reviews", sql: true },
        { text: "WHERE product_id = $1", sql: true },
      ]} />
      <Chip y={700} color={C.amber} show={ramp(frame, tenth, 6)} big="100 ms" text="every time it runs" small="median of 20 · index-only scan" />
      <div style={{ opacity: ramp(frame, cache, 6) }}>
        <CacheCard x={40} y={930} state="fresh" />
        <div style={{ position: "absolute", left: 560, top: 960, width: 480, font: `800 44px/1.2 "${FONT.display}"`, color: C.text }}>
          so: keep it<br /><span style={{ color: C.green }}>for 60 seconds</span>
        </div>
      </div>
    </>
  );
};

/** While it's fresh: 1,000 answers, no queries. */
export const Hit: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const thousand = at(line, "1,000"), nothing = at(line, "nothing");
  const done = interpolate(frame, [thousand, thousand + 16], [0, 1000], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}><Big size={80}>While it's cached</Big></div>
      <CacheCard x={40} y={300} state="fresh" />
      <DbCard x={560} y={300} queries={0} note="nobody asked" />
      <Crowd y={580} label="1,000 requests" color={(i) => (i < done ? C.green : IDLE)} />
      <Chip y={940} color={C.green} show={ramp(frame, nothing, 6)} big="0.5 ms" text="the slowest of 1,000" small="0 queries · all answered from memory" />
    </>
  );
};

/** The stampede: the key expires, and every request goes to the database. */
export const Stampede: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const expires = at(line, "expires"), every = at(line, "every"), last = at(line, "last");
  const q = Math.round(interpolate(frame, [every - 2, every + 26], [0, 1000], clamp));
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}><Big size={80}>Then it expires</Big></div>
      <CacheCard x={40} y={300} state={frame >= expires ? "expired" : "fresh"} />
      <DbCard x={560} y={300} queries={q} note="through a pool of 20" />
      <Crowd y={580} label="1,000 requests, all missing" color={(i) => (frame < expires ? C.green : i < q ? C.red : C.blue)} />
      <Chip y={940} color={C.red} show={ramp(frame, last, 6)} big="64 s" text="the last request's wait" small="1,000 queries · 3 runs: 63.5 to 64.1 s" />
      <Stamp text="STAMPEDE" color={C.red} at={every + 30} x={540} y={760} rotate={-6} />
    </>
  );
};

/** Fix one: the first request loads, everyone else waits for its answer. */
export const Flight: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const first = at(line, "first"), rest = at(line, "rest"), query = at(line, "query"), everyone = at(line, "everyone");
  const colour = (i: number) => {
    if (frame >= everyone) return C.green;
    if (i === 0) return frame >= first ? C.blue : IDLE;
    return frame >= rest ? C.amber : IDLE;
  };
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}><Big size={74}>Fix 1: one asks</Big></div>
      <CacheCard x={40} y={300} state={frame >= everyone ? "fresh" : "expired"} />
      <DbCard x={560} y={300} queries={frame >= first ? 1 : 0} note={frame >= query ? "the only query" : "each one: ~100 ms"} />
      <Crowd y={580} label={frame >= rest && frame < everyone ? "1 asking · 999 waiting for its answer" : "1,000 requests"} color={colour} />
      <Chip y={940} color={C.green} show={ramp(frame, everyone, 6)} big="0.35 s" text="all 1,000 answered" small="1 query · 3 runs: 0.21 to 0.35 s" />
    </>
  );
};

/** Fix two: serve the old value while one request refreshes it. */
export const Stale: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const old = at(line, "old"), background = at(line, "background"), nobody = at(line, "nobody");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}><Big size={74}>Fix 2: serve the old one</Big></div>
      <CacheCard x={40} y={300} state={frame >= old ? "stale" : "expired"} />
      <DbCard x={560} y={300} queries={frame >= background ? 1 : 0} note={frame >= background ? "one refresh, in the background" : "each one: ~100 ms"} />
      <Crowd y={580} label="1,000 requests" color={() => (frame >= old ? C.green : IDLE)} />
      <Chip y={940} color={C.green} show={ramp(frame, nobody, 6)} big="0.7 ms" text="the slowest of 1,000" small="1 query · nobody waited for it" />
    </>
  );
};

/** Keys cached together expire together. */
export const Together: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const thousand = at(line, "10,000"), random = at(line, "randomness");
  const H = 440, base = 900;
  const spike = interpolate(frame, [thousand + 6, thousand + 20], [0, H], clamp);
  const spread = ramp(frame, random, 10);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}><Big size={72}>Same lifetime, same second</Big></div>
      <div style={{ position: "absolute", left: 60, top: 280, font: `700 30px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, thousand - 2, 6) }}>
        10,000 keys cached at once · 5-minute lifetime
      </div>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1000 }} viewBox="0 0 1080 1000">
        <line x1={60} y1={base} x2={1020} y2={base} stroke={C.border} strokeWidth={3} />
        {/* no randomness: all 10,000 in one second */}
        <rect x={528} y={base - spike * (1 - spread)} width={24} height={spike * (1 - spread)} fill={C.red} />
        {/* ±10%: spread over 60 seconds, at most 195 in one */}
        {Array.from({ length: 60 }, (_, i) => (
          <rect key={i} x={100 + i * 14.6} y={base - spread * 10} width={11} height={spread * 10} fill={C.green} />
        ))}
        <text x={60} y={base + 50} fill={C.muted} style={{ font: `700 26px "${FONT.mono}"` }}>4:30</text>
        <text x={510} y={base + 50} fill={C.muted} style={{ font: `700 26px "${FONT.mono}"` }}>5:00</text>
        <text x={950} y={base + 50} fill={C.muted} style={{ font: `700 26px "${FONT.mono}"` }}>5:30</text>
      </svg>
      <div style={{ position: "absolute", left: 600, top: 470, opacity: ramp(frame, thousand + 12, 6) * (1 - spread) }}>
        <div style={{ font: `800 80px/1 "${FONT.mono}"`, color: C.red }}>10,000</div>
        <div style={{ font: `800 34px "${FONT.display}"`, color: C.text }}>expire in the same second</div>
      </div>
      <div style={{ position: "absolute", left: 100, top: 700, opacity: spread }}>
        <div style={{ font: `800 80px/1 "${FONT.mono}"`, color: C.green }}>195</div>
        <div style={{ font: `800 34px "${FONT.display}"`, color: C.text }}>at most, in any second · lifetime ±10%</div>
      </div>
    </>
  );
};

/** The real case: Facebook's own account of 23 September 2010. */
export const Facebook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const year = at(line, "2010"), client = at(line, "client"), hundreds = at(line, "hundreds"), down = at(line, "down");
  const steps: [string, string, number][] = [
    ["a cached setting looked invalid", C.amber, year],
    ["every client tried to fix it: a database query", C.blue, client],
    ["hundreds of thousands of queries a second", C.red, hundreds],
    ["down for about 2.5 hours", C.red, down],
  ];
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>Facebook, 2010</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 10 }}>Robert Johnson, Facebook Engineering, 23 Sept 2010</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 360, width: 1000 }}>
        {steps.map(([text, color, when], i) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 22, borderRadius: 22, background: C.surface,
                                   border: `3px solid ${color}`, padding: "18px 24px", opacity: ramp(frame, when, 6),
                                   transform: `translateY(${(1 - ramp(frame, when, 6)) * 30}px)` }}>
            <div style={{ width: 54, height: 54, borderRadius: 27, background: color, color: C.bg, display: "flex", alignItems: "center",
                          justifyContent: "center", font: `800 32px "${FONT.display}"`, flex: "none" }}>{i + 1}</div>
            <div style={{ font: `800 40px/1.2 "${FONT.display}"`, color: C.text }}>{text}</div>
          </div>
        ))}
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const database = at(line, "database");
    return (
      <>
        <CacheTitle hot={frame >= database ? 1 : 0} />
        <CacheCard x={40} y={440} state="expired" />
        <DbCard x={560} y={440} queries={1000} />
      </>
    );
  }
  if (variant === "youtube") {
    // YouTube has no comment-to-DM: the Short asks to follow instead
    const every = at(line, "every");
    return (
      <div style={{ position: "absolute", left: 60, top: 230 }}>
        <Big size={150}>Follow</Big>
        <Big size={96} color={C.yellow}>@StackNovaDev</Big>
        <div style={{ opacity: ramp(frame, every, 8), marginTop: 40, display: "flex", gap: 18 }}>
          {["one button", "the backend behind it", "every day"].map((t) => (
            <div key={t} style={{ font: `700 30px "${FONT.ui}"`, color: C.text, border: `3px solid ${C.border}`, borderRadius: 999, padding: "12px 24px",
                                  background: C.surface, whiteSpace: "nowrap" }}>{t}</div>
          ))}
        </div>
      </div>
    );
  }
  const comment = at(line, "comment"), guide = at(line, "guide");
  const typed = keyword.slice(0, Math.max(0, Math.floor((frame - comment - 4) / 3)));
  const dm = pop(frame, guide);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 210 }}>
        <Big size={120}>Comment</Big>
        <Big size={190} color={C.yellow}>{keyword}</Big>
        <div style={{ font: `700 34px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>follow first, so the DM can reach you</div>
      </div>
      <div style={{ position: "absolute", left: 60, top: 640, width: 960, display: "flex", alignItems: "center", gap: 20,
                    borderRadius: 26, background: C.surface, border: `3px solid ${C.border}`, padding: 22 }}>
        <div style={{ width: 70, height: 70, borderRadius: 35, background: `linear-gradient(135deg, ${C.blue}, ${C.purple})` }} />
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>you<br />
          <span style={{ font: `800 44px "${FONT.display}"`, color: C.text }}>{typed}<span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>|</span></span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 300, top: 820, width: 720, transform: `scale(${dm})`, transformOrigin: "right top",
                    borderRadius: 30, background: "#1b2333", border: `3px solid ${C.blue}`, padding: 26 }}>
        <div style={{ font: `700 26px "${FONT.ui}"`, color: C.muted }}>@stacknova.dev · DM</div>
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 Stop the Stampede · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>real Go + SQL, every case tested · PDF</div>
      </div>
    </>
  );
};
