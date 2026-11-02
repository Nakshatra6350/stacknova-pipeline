// The ten scenes of Behind the Button #5, "A billion usernames, and it opens four pages"
// (content/v4/005-name/script.yaml). Each scene runs from its line's start until the next line starts,
// and times its beats to its line's words. The numbers and page routes are real: name.exe -mode=scale,
// tree, traps, lower, billion and race (samples/go), on 10 million names in PostgreSQL 16.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { Editor, Stamp, Terminal, clamp, pop, ramp } from "../ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

// from the runs (see content/v4/005-name/script.yaml, fact_check)
const FAST_MS = "0.2 ms";
const SCAN_S = 0.8;
const LOWER_S = 3.3;
export const ROUTE = [
  { page: 209, kind: "the top page", count: "189 ranges", before: "menalajaligi8", key: "mevifotebara3", after: "migotilavaref" },
  { page: 20405, kind: "the middle", count: "203 ranges", before: "migefofodovad", key: "migehikivofo1", after: "migekebezileb" },
  { page: 20582, kind: "the last page", count: "261 names", before: "migejojekane3", key: "migejojorile9", after: "migejokalonad" },
];

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

/** A signup form's username box and the answer next to it. */
export const SignupField: React.FC<{ typed: string; state: "taken" | "free" | "wait"; y: number; x?: number; width?: number; ms?: string; size?: number; label?: string }> =
  ({ typed, state, y, x = 40, width = 1000, ms, size = 64, label = "Choose a username" }) => {
    const color = { taken: C.red, free: C.green, wait: C.muted }[state];
    const word = { taken: "✗ Taken", free: "✓ Available", wait: "Checking…" }[state];
    return (
      <div style={{ position: "absolute", left: x, top: y, width, borderRadius: 28, background: C.surface,
                    border: `3px solid ${state === "wait" ? C.border : color}`, padding: "20px 28px",
                    boxShadow: "0 24px 50px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ font: `700 ${size * 0.47}px "${FONT.ui}"`, color: C.muted }}>{label}</div>
          {ms && <div style={{ font: `700 ${size * 0.47}px "${FONT.mono}"`, color }}>{ms}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 20 }}>
          <div style={{ font: `700 ${size}px "${FONT.mono}"`, color: C.text, whiteSpace: "nowrap" }}>{typed}</div>
          <div style={{ font: `800 ${size * 0.8}px "${FONT.display}"`, color, whiteSpace: "nowrap" }}>{word}</div>
        </div>
      </div>
    );
  };

/** The hook (and the loop's last frame). */
export const NameTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["A billion usernames.", "It opens 4 pages."].map((t, n) => (
      <Big key={t} size={102} color={hot === n ? (n === 1 ? C.green : C.yellow) : C.text}
           style={{ marginBottom: 14, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

/** One page of the index, as a sheet with a turned corner. */
const Sheet: React.FC<{ n: number; lit: number; x: number; y: number; size?: number; color?: string }> =
  ({ n, lit, x, y, size = 200, color = C.green }) => (
    <div style={{ position: "absolute", left: x, top: y, width: size, height: size * 1.28, borderRadius: 16,
                  background: lit > 0 ? `${color}1f` : "#121822", border: `4px solid ${lit > 0 ? color : C.border}`,
                  transform: `scale(${0.6 + 0.4 * Math.min(lit, 1.2)})`, opacity: lit > 0 ? 1 : 0.55,
                  boxShadow: lit > 0 ? `0 0 34px ${color}55` : "none" }}>
      {[0, 1, 2, 3].map((r) => (
        <div key={r} style={{ margin: `${r === 0 ? size * 0.14 : size * 0.07}px ${size * 0.13}px 0`, height: size * 0.05, borderRadius: 4,
                              background: lit > 0 ? `${color}88` : "#2a3240", width: `${74 - r * 10}%` }} />
      ))}
      <div style={{ position: "absolute", right: size * 0.1, bottom: size * 0.06, font: `800 ${size * 0.34}px "${FONT.mono}"`, color: lit > 0 ? color : "#4b5566" }}>{n}</div>
    </div>
  );

export const FourPages: React.FC<{ y: number; shown: number; at?: number[]; frame?: number }> = ({ y, shown }) => (
  <>
    {[1, 2, 3, 4].map((n, i) => (
      <Sheet key={n} n={n} lit={i < shown ? 1 : 0} x={70 + i * 245} y={y} />
    ))}
  </>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const opens = at(line, "opens"), pages = at(line, "pages", 1);
  const step = Math.max(3, (pages + 6 - opens) / 4);
  return (
    <>
      <NameTitle hot={frame >= opens ? 1 : 0} />
      <SignupField y={470} typed="alice" state="taken" ms={FAST_MS} />
      {[1, 2, 3, 4].map((n, i) => (
        <Sheet key={n} n={n} lit={pop(frame, opens + i * step)} x={70 + i * 245} y={740} />
      ))}
    </>
  );
};

// the same made-up names the test table holds (samples/go/names.go)
const SYLLABLES = "bdfghjklmnprstvz".split("").flatMap((c) => "aeio".split("").map((v) => c + v));
function fakeName(i: number): string {
  let x = (i * 2654435761) % 1099511627776;
  let out = "";
  for (let s = 0; s < 6; s++) { out += SYLLABLES[Math.floor(x) % 64]; x = Math.floor(x / 64); }
  return out + "0123456789abcdef"[Math.floor(x) % 16];
}

/** No index: every name is read, one after another. */
export const Scan: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const tested = at(line, "tested"), every = at(line, "each");
  const share = interpolate(frame, [0, every], [0.02, 1], clamp);
  const timer = interpolate(frame, [tested, every], [0, SCAN_S], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 180, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>No index</Big>
        <div style={{ font: `700 34px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>looking for a name that isn't there</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 330, width: 560, borderRadius: 24, background: "#0d1117", border: `3px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 22px", background: C.raised, font: `700 28px "${FONT.mono}"`, color: C.purple }}>users</div>
        <div style={{ padding: "8px 0" }}>
          {Array.from({ length: 11 }).map((_, r) => (
            <div key={r} style={{ padding: "6px 22px", font: `500 34px "${FONT.mono}"`, color: r === 5 ? C.text : C.muted,
                                  background: r === 5 ? `${C.red}33` : "transparent", boxShadow: r === 5 ? `inset 8px 0 0 ${C.red}` : "none" }}>
              {fakeName((frame + 1) * 40503 + r)}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 630, top: 340, width: 410 }}>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>names read</div>
        <div style={{ font: `800 62px "${FONT.mono}"`, letterSpacing: -3, color: C.red, marginTop: 4 }}>{Math.round(share * 10_000_000).toLocaleString("en-US")}</div>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted, marginTop: 4 }}>of 10,000,000</div>
        <div style={{ marginTop: 18, height: 26, borderRadius: 13, background: "#1a212c", overflow: "hidden" }}>
          <div style={{ width: `${share * 100}%`, height: "100%", background: C.red }} />
        </div>
        <div style={{ marginTop: 44, opacity: ramp(frame, tested - 3, 6), font: `700 30px "${FONT.ui}"`, color: C.muted }}>one check</div>
        <div style={{ opacity: ramp(frame, tested - 3, 6), font: `800 118px "${FONT.mono}"`, letterSpacing: -6, color: C.amber }}>{timer.toFixed(1)} s</div>
      </div>
    </>
  );
};

/** The real route through the real index, one page after another. */
export const Tree: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const top = at(line, "top"), next = at(line, "next"), each = at(line, "each");
  const reach = [top, next, next + 14];
  const H = 215;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 170, display: "flex", alignItems: "baseline", gap: 18, opacity: ramp(frame, 0, 6) }}>
        <span style={{ font: `700 34px "${FONT.ui}"`, color: C.muted }}>finding</span>
        <span style={{ font: `800 58px "${FONT.mono}"`, letterSpacing: -2, color: C.yellow }}>{ROUTE[2].key}</span>
      </div>
      {ROUTE.map((p, n) => {
        const lit = ramp(frame, reach[n], 6);
        const pulled = frame >= reach[n];
        return (
          <div key={p.page} style={{ position: "absolute", left: 40, top: 260 + n * (H + 40), width: 1000, height: H, borderRadius: 26, background: C.surface,
                                     border: `3px solid ${pulled ? C.blue : C.border}`, padding: "16px 26px", boxSizing: "border-box",
                                     opacity: 0.45 + 0.55 * lit, boxShadow: pulled ? `0 0 34px ${C.blue}44` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>{p.kind}</span>
              <span style={{ font: `700 30px "${FONT.mono}"`, color: frame >= each ? C.green : C.muted }}>{p.count}</span>
            </div>
            <div style={{ marginTop: 12, font: `500 32px/1.28 "${FONT.mono}"`, color: C.muted }}>
              <div>{p.before}</div>
              <div style={{ color: pulled ? C.text : C.muted, background: pulled ? `${C.blue}33` : "transparent", margin: "0 -26px", padding: "0 26px",
                            boxShadow: pulled ? `inset 8px 0 0 ${C.blue}` : "none" }}>
                {p.key} {n < 2 ? <span style={{ color: C.blue }}>→ page {ROUTE[n + 1].page.toLocaleString("en-US")}</span> : <span style={{ color: C.green }}>found</span>}
              </div>
              <div>{p.after}</div>
            </div>
          </div>
        );
      })}
    </>
  );
};

const DEPTH = [
  { rows: "1,000", pages: 2 },
  { rows: "100,000", pages: 3 },
  { rows: "10,000,000", pages: 3 },
  { rows: "1,000,000,000", pages: 4, guess: true },
];

/** How deep the real index is at each size. */
export const Depth: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const ten = at(line, "10"), billion = at(line, "billion");
  return (
    <>
      <Terminal y={165} title="~/name · go + postgres 16 · 10M names" steps={[
        { cmd: "EXPLAIN SELECT 1 ... username = $1", out: "Index Only Scan\nBuffers: shared hit=3\n0.2 ms", color: C.green, at: Math.max(0, ten - 22) },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 610, width: 1000 }}>
        {DEPTH.map((d, n) => {
          const show = n < 3 ? ramp(frame, ten + (n - 2) * 5, 6) : ramp(frame, billion - 2, 6);
          return (
            <div key={d.rows} style={{ display: "flex", alignItems: "center", gap: 22, padding: "10px 24px", marginBottom: 8, opacity: show,
                                       borderRadius: 16, background: d.guess ? `${C.green}22` : C.surface, border: `3px solid ${d.guess ? C.green : C.border}` }}>
              <span style={{ width: 420, font: `800 50px "${FONT.mono}"`, letterSpacing: -2, color: d.guess ? C.green : C.text, whiteSpace: "nowrap" }}>{d.rows}</span>
              <span style={{ display: "flex", gap: 10 }}>
                {Array.from({ length: d.pages }).map((_, i) => (
                  <span key={i} style={{ width: 44, height: 56, borderRadius: 8, background: `${C.green}44`, border: `3px solid ${C.green}` }} />
                ))}
              </span>
              <span style={{ marginLeft: "auto", font: `700 32px "${FONT.ui}"`, color: d.guess ? C.green : C.muted, whiteSpace: "nowrap" }}>{d.pages} pages{d.guess ? " (estimate)" : ""}</span>
            </div>
          );
        })}
      </div>
    </>
  );
};

/** One word in the query, and the index stops being used. */
export const Bug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const adds = at(line, "adds"), same = at(line, "over"), holds = at(line, "holds");
  const timer = interpolate(frame, [same, same + 26], [0, LOWER_S], clamp);
  return (
    <>
      <Editor file="the same check, one word later" y={165} enter={ramp(frame, 0, 8)} lines={[
        { text: "SELECT 1 FROM users", sql: true },
        { text: frame >= adds ? " WHERE lower(username) = lower($1);" : " WHERE username = $1;", sql: true, hl: frame >= adds ? "red" : undefined },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 395, width: 1000, boxSizing: "border-box", borderRadius: 26, background: C.surface,
                    border: `3px solid ${frame >= adds ? C.red : C.green}`, padding: "20px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ font: `800 140px "${FONT.mono}"`, letterSpacing: -7, color: frame >= adds ? C.red : C.green, width: 480, whiteSpace: "nowrap" }}>{frame >= adds ? `${timer.toFixed(1)} s` : FAST_MS}</div>
          <div>
            <div style={{ font: `800 44px/1.15 "${FONT.display}"`, color: C.text }}>{frame >= adds ? "every name read again" : "three pages"}</div>
            <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 8 }}>{frame >= adds ? "Parallel Seq Scan" : "Index Only Scan"}</div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 660, width: 1000, opacity: ramp(frame, holds - 3, 6), display: "flex", gap: 24 }}>
        <div style={{ flex: 1, borderRadius: 22, background: C.surface, border: `3px solid ${C.green}`, padding: "18px 24px" }}>
          <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>the index holds</div>
          <div style={{ font: `800 58px "${FONT.mono}"`, color: C.green, marginTop: 8 }}>username</div>
        </div>
        <div style={{ flex: 1, borderRadius: 22, background: C.surface, border: `3px solid ${C.red}`, padding: "18px 24px" }}>
          <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>you asked for</div>
          <div style={{ font: `800 58px "${FONT.mono}"`, letterSpacing: -2, color: C.red, marginTop: 8, whiteSpace: "nowrap" }}>lower(username)</div>
        </div>
      </div>
    </>
  );
};

export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const again = at(line, "0.2"), alice = at(line, "alice", 1);
  const refused = pop(frame, alice + 6);
  return (
    <>
      <Editor file="the fix: index what you ask for" y={165} enter={ramp(frame, 0, 8)} lines={[
        { text: "CREATE UNIQUE INDEX CONCURRENTLY", sql: true },
        { text: "  users_lower_key", sql: true },
        { text: "  ON users (lower(username));", sql: true, hl: "green" },
      ]} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 445, textAlign: "center", transform: `scale(${pop(frame, again)})` }}>
        <span style={{ font: `800 70px "${FONT.mono}"`, letterSpacing: -3, color: C.muted, textDecoration: `line-through 6px ${C.red}` }}>3.3 s</span>
        <span style={{ font: `800 70px "${FONT.mono}"`, color: C.muted }}> → </span>
        <span style={{ font: `800 128px "${FONT.mono}"`, letterSpacing: -6, color: C.green }}>0.2 ms</span>
      </div>
      <div style={{ opacity: ramp(frame, alice - 3, 6) }}>
        <SignupField y={640} typed="alice" state="free" size={52} label="first signup" />
        <div style={{ transform: `scale(${0.85 + 0.15 * Math.min(refused, 1)})`, opacity: Math.min(1, refused * 1.5) }}>
          <SignupField y={830} typed="Alice" state="taken" size={52} label="second signup" />
        </div>
      </div>
    </>
  );
};

/** A real billion names in 1.2 GB: a row of bits, and the two answers it can give. */
export const Bloom: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const billion = at(line, "billion"), no = at(line, "no"), yes = at(line, "yes");
  const seven = [5, 17, 26, 41, 58, 66, 83];
  const lit = (n: number) => {
    const i = seven.indexOf(n);
    return i >= 0 && frame >= billion - 16 + i * 3;
  };
  // from "no" on, one bit is off: a name this filter has never seen
  const gone = frame >= no && frame < yes ? 41 : -1;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 170, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>A Bloom filter</Big>
      </div>
      <div style={{ position: "absolute", left: 40, top: 280, width: 1000, display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 6 }}>
        {Array.from({ length: 96 }).map((_, n) => {
          const on = lit(n) && n !== gone;
          const out = n === gone;
          return (
            <div key={n} style={{ height: 50, borderRadius: 8, background: on ? `${C.amber}55` : "#121822", border: `3px solid ${out ? C.red : on ? C.amber : C.border}`,
                                  boxShadow: out ? `0 0 22px ${C.red}` : "none", display: "flex", alignItems: "center", justifyContent: "center",
                                  font: `700 22px "${FONT.mono}"`, color: out ? C.red : on ? C.amber : "#364050" }}>{on ? 1 : 0}</div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 40, top: 640, width: 1000, display: "flex", gap: 24, opacity: ramp(frame, billion - 2, 6), alignItems: "baseline" }}>
        <span style={{ font: `800 86px "${FONT.mono}"`, letterSpacing: -4, color: C.amber, whiteSpace: "nowrap" }}>1,000,000,000</span>
        <span style={{ font: `800 86px "${FONT.mono}"`, letterSpacing: -4, color: C.text, marginLeft: "auto", whiteSpace: "nowrap" }}>1.2 GB</span>
      </div>
      <div style={{ position: "absolute", left: 40, top: 760, width: 1000, display: "flex", gap: 24 }}>
        <div style={{ flex: 1, opacity: ramp(frame, no - 2, 6), borderRadius: 22, background: C.surface, border: `3px solid ${C.green}`, padding: "16px 22px" }}>
          <div style={{ font: `800 46px "${FONT.display}"`, color: C.green }}>"No"</div>
          <div style={{ font: `700 32px/1.2 "${FONT.ui}"`, color: C.text, marginTop: 6 }}>a bit is off: free, for sure</div>
        </div>
        <div style={{ flex: 1, opacity: ramp(frame, yes - 2, 6), borderRadius: 22, background: C.surface, border: `3px solid ${C.amber}`, padding: "16px 22px" }}>
          <div style={{ font: `800 46px "${FONT.display}"`, color: C.amber }}>"Yes"</div>
          <div style={{ font: `700 32px/1.2 "${FONT.ui}"`, color: C.text, marginTop: 6 }}>maybe: ask the database</div>
        </div>
      </div>
    </>
  );
};

/** Two people, both told the name is free, both tapping at once. */
export const Tick: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const guess = at(line, "guess"), same = at(line, "same"), first = at(line, "1,000"), zero = at(line, "0");
  const count = Math.round(interpolate(frame, [first, first + 22], [0, 1000], clamp));
  const tap = frame >= same && frame < same + 10 ? 1 : 0;
  const fixed = frame >= zero;
  const form = (who: string, x: number) => (
    <div style={{ position: "absolute", left: x, top: 175, width: 490, borderRadius: 26, background: C.surface, border: `3px solid ${C.green}`, padding: 22, boxSizing: "border-box" }}>
      <div style={{ font: `700 28px "${FONT.ui}"`, color: C.muted }}>{who}</div>
      <div style={{ font: `700 48px "${FONT.mono}"`, color: C.text, marginTop: 8 }}>alice_7</div>
      <div style={{ font: `800 38px "${FONT.display}"`, color: C.green, marginTop: 6 }}>✓ Available</div>
      <div style={{ marginTop: 14, borderRadius: 16, padding: "14px 0", textAlign: "center", background: C.blue, transform: `scale(${1 - 0.06 * tap})`,
                    font: `800 36px "${FONT.display}"`, color: "#0a0d12" }}>Sign up</div>
    </div>
  );
  return (
    <>
      {form("you", 40)}
      {form("someone else", 550)}
      <Stamp text="ONLY A GUESS" color={C.amber} at={guess} x={540} y={505} rotate={-3} />
      <div style={{ position: "absolute", left: 40, top: 600, width: 1000, opacity: ramp(frame, first - 3, 6), borderRadius: 26, background: C.surface, border: `3px solid ${fixed ? C.green : C.red}`, padding: "22px 30px", boxSizing: "border-box" }}>
        <div style={{ font: `800 150px/1 "${FONT.mono}"`, letterSpacing: -7, color: fixed ? C.green : C.red }}>{fixed ? "0" : count.toLocaleString("en-US")}</div>
        <div style={{ font: `800 44px "${FONT.display}"`, color: C.text, marginTop: 8 }}>of 1,000 names signed up twice</div>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 6 }}>{fixed ? "with a unique index" : "look first, then insert"}</div>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 925, opacity: ramp(frame, zero, 6), textAlign: "center", font: `800 44px "${FONT.display}"`, color: C.green }}>the index decides, not the tick</div>
    </>
  );
};

/** Spotify's own write-up: a cleaning step that gave a new answer the second time. */
export const Spotify: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const tiny = at(line, "tiny"), turned = at(line, "became"), reset = at(line, "reset"), taken = at(line, "taken");
  const chip = (text: string, y: number, color: string, label: string, show: number, tinyFont = false) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, opacity: show, transform: `translateY(${(1 - show) * 30}px)`, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, padding: "16px 28px", boxSizing: "border-box",
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ font: `800 74px ${tinyFont ? `"Segoe UI", "${FONT.ui}"` : `"${FONT.mono}"`}`, color, whiteSpace: "nowrap" }}>{text}</span>
      <span style={{ font: `700 30px/1.2 "${FONT.ui}"`, color: C.muted, textAlign: "right" }}>{label}</span>
    </div>
  );
  const arrow = (y: number, text: string, show: number) => (
    <div style={{ position: "absolute", left: 80, top: y, opacity: show, font: `700 32px "${FONT.mono}"`, color: C.amber }}>↓ {text}</div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 170, opacity: ramp(frame, 0, 6) }}>
        <Big size={80}>Spotify</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 8 }}>their own engineers' write-up, 2013</div>
      </div>
      {chip("ᴮᴵᴳᴮᴵᴿᴰ", 310, C.amber, "the name typed\nat signup", ramp(frame, tiny - 2, 6), true)}
      {arrow(440, "cleaned once", ramp(frame, turned - 4, 6))}
      {chip("BIGBIRD", 495, C.text, "no clash:\nsignup allowed", ramp(frame, turned, 6))}
      {arrow(625, "cleaned again, at password reset", ramp(frame, reset - 4, 6))}
      {chip("bigbird", 680, C.red, "someone else's\naccount", ramp(frame, reset, 6))}
      <Stamp text="TAKEN OVER" color={C.red} at={taken} x={560} y={930} rotate={-5} />
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const four = at(line, "4");
    return (
      <>
        <NameTitle hot={frame >= four ? 1 : 0} />
        <SignupField y={470} typed="alice" state="taken" ms={FAST_MS} />
        {[1, 2, 3, 4].map((n, i) => (
          <Sheet key={n} n={n} lit={pop(frame, four + i * 3)} x={70 + i * 245} y={740} />
        ))}
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 Four Pages to a Billion · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>every case tested, in real Go + SQL · PDF</div>
      </div>
    </>
  );
};
