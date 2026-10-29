// The nine scenes of the pilot, "The last seat" (content/v4/001-last-seat/script.yaml). Each scene
// runs from its line's start until the next line starts, and times its beats to its line's words.
import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { C, FONT } from "./theme";
import { Line, frames, wordAt } from "./timeline";
import { Arrow, CodeLine, Editor, Phone, SeatRow, Stamp, Terminal, clamp, pop, ramp } from "./ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

/** The hook (and the loop's last frame): 2 people, 1 seat, the same millisecond. */
export const HookTitle: React.FC<{ hot?: number }> = ({ hot = -1 }) => (
  <div style={{ position: "absolute", left: 60, top: 200 }}>
    {["2 people.", "1 seat.", "Same millisecond."].map((t, n) => (
      <Big key={t} size={n === 2 ? 112 : 150} color={hot === n ? C.yellow : C.text}
           style={{ marginBottom: 14, transform: `scale(${hot === n ? 1.04 : 1})`, transformOrigin: "left center" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const hot = frame >= at(line, "exact") ? 2 : frame >= at(line, "one") ? 1 : 0;
  const tap = frame >= at(line, "millisecond") ? 1 : 0;
  const q = pop(frame, at(line, "who"));
  const ms = Math.floor(frame * 33.3) % 1000;
  return (
    <>
      <HookTitle hot={hot} />
      <Phone name="Ana" state={tap ? "loading" : "idle"} x={40} y={780} tap={tap} />
      <Phone name="Bo" state={tap ? "loading" : "idle"} x={740} y={780} tap={tap} />
      <div style={{ position: "absolute", left: 340, top: 860, width: 400, textAlign: "center" }}>
        <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>both tap at</div>
        <div style={{ font: `700 46px "${FONT.mono}"`, color: C.amber }}>19:00:00.{String(ms).padStart(3, "0")}</div>
        <div style={{ font: `800 210px "${FONT.display}"`, color: C.yellow, transform: `scale(${q})`, marginTop: 10 }}>?</div>
      </div>
    </>
  );
};

/** "Both do": two confirmations, then the test: 999 of 1,000 seats sold twice. */
export const Stakes: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const test = at(line, "tested");
  const count = Math.round(interpolate(frame, [at(line, "999", 1, -0.2), at(line, "seats", 1, 0.4)], [0, 999], clamp));
  const both = ramp(frame, 0, 6) * (1 - ramp(frame, test - 6, 8));
  return (
    <>
      {frame < test + 4 && (
        <div style={{ opacity: both }}>
          <Phone name="Ana" state="booked" x={90} y={320} scale={0.95} />
          <Phone name="Bo" state="booked" x={690} y={320} scale={0.95} />
          <Big size={160} color={C.red} style={{ position: "absolute", left: 500, top: 520 }}>=</Big>
        </div>
      )}
      {frame >= test - 2 && (
        <div style={{ opacity: ramp(frame, test - 2, 8) }}>
          <div style={{ position: "absolute", left: 60, top: 210, display: "flex", alignItems: "baseline", gap: 18 }}>
            <Big size={190} color={C.red}>{count}</Big>
            <Big size={56} color={C.muted}>/ 1,000 seats</Big>
          </div>
          <div style={{ position: "absolute", left: 66, top: 410, font: `800 54px "${FONT.display}"`, color: C.text }}>
            sold twice
          </div>
          <div style={{ position: "absolute", left: 66, top: 484, font: `500 26px "${FONT.mono}"`, color: C.muted }}>
            my test · Postgres 16 · 2 requests per seat, sent together
          </div>
          <div style={{ position: "absolute", left: 60, top: 560, display: "grid", gridTemplateColumns: "repeat(40, 20px)", gap: 4 }}>
            {Array.from({ length: 1000 }).map((_, n) => (
              <div key={n} style={{ width: 20, height: 20, borderRadius: 4,
                                    background: n < count ? C.red : n === 999 ? C.green : "#222a36" }} />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

/** Why: both read "free", both write, both are told they got it. */
export const Race: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const read = at(line, "reads"), free = at(line, "free"), write = at(line, "write"), conf = at(line, "confirmation");
  const holder = frame >= write + 14 ? "bo" : frame >= write + 4 ? "ana" : null;
  const flash = interpolate(frame, [write + 4, write + 10, write + 14, write + 20], [1, 0, 1, 0], clamp);
  const state = frame >= conf ? "booked" : frame >= read ? "loading" : "idle";
  const draw = (start: number) => interpolate(frame, [start, start + 10], [0, 1], clamp);
  return (
    <>
      <Phone name="Ana" state={state} x={65} y={170} scale={0.72} />
      <Phone name="Bo" state={state} x={715} y={170} scale={0.72} />
      <SeatRow holder={holder} x={350} y={800} flash={flash} />
      <Arrow a={[300, 610]} b={[440, 790]} progress={draw(read)} color={C.blue} label="SELECT" />
      <Arrow a={[780, 610]} b={[640, 790]} progress={draw(read + 3)} color={C.blue} label="SELECT" />
      <Arrow a={[400, 800]} b={[250, 640]} progress={draw(free)} color={C.green} label="free" />
      <Arrow a={[680, 800]} b={[830, 640]} progress={draw(free + 2)} color={C.green} label="free" />
      <Arrow a={[200, 650]} b={[380, 900]} progress={draw(write)} color={C.amber} label="UPDATE ana" />
      <Arrow a={[880, 650]} b={[700, 900]} progress={draw(write + 10)} color={C.amber} label="UPDATE bo" />
      <Stamp text="SOLD TWICE" color={C.red} at={conf + 8} x={540} y={520} />
    </>
  );
};

const BUG: CodeLine[] = [
  { text: "func book(seat int, user string) bool {" },
  { text: "    var holder *string" },
  { text: "    db.QueryRow(ctx," },
  { text: "        `SELECT holder FROM seats WHERE id = $1`," },
  { text: "        seat).Scan(&holder)" },
  { text: "    if holder != nil {" },
  { text: "        return false // already taken" },
  { text: "    }" },
  { text: "    db.Exec(ctx," },
  { text: "        `UPDATE seats SET holder = $1 WHERE id = $2`," },
  { text: "        user, seat)" },
  { text: "    return true" },
  { text: "}" },
];

export const CodeBug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const sel = at(line, "select"), upd = at(line, "update"), gap = at(line, "gap");
  const lines = BUG.map((l, n) => ({
    ...l,
    hl: (frame >= sel && n >= 2 && n <= 4 ? "red" : frame >= upd && n >= 8 && n <= 10 ? "red"
      : frame >= gap && n >= 5 && n <= 7 ? "amber" : undefined) as CodeLine["hl"],
  }));
  const g = pop(frame, gap);
  return (
    <>
      <Editor file="book.go · the usual version" lines={lines} y={210} enter={ramp(frame, 0, 8)}
              note="error handling left out here · full code in the free guide" />
      <div style={{ position: "absolute", left: 640, top: 520, transform: `scale(${g})`, transformOrigin: "left center",
                    font: `800 40px "${FONT.display}"`, color: C.amber, background: "rgba(10,13,18,.9)",
                    border: `4px solid ${C.amber}`, borderRadius: 18, padding: "10px 20px" }}>
        ← the gap
      </div>
    </>
  );
};

const FIX: CodeLine[] = [
  { text: "func book(seat int, user string) bool {" },
  { text: "    tag, _ := db.Exec(ctx," },
  { text: "        `UPDATE seats SET holder = $1" },
  { text: "         WHERE id = $2 AND holder IS NULL`," },
  { text: "        user, seat)" },
  { text: "    return tag.RowsAffected() == 1" },
  { text: "}" },
];

export const CodeFix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const swap = at(line, "one");
  const empty = at(line, "empty"), exact = at(line, "exactly");
  const old = BUG.map((l, n) => ({ ...l, dim: n > 0 && n < 12, strike: n >= 2 && n <= 11 }));
  const fix = FIX.map((l, n) => ({
    ...l, hl: (frame >= exact && n === 5 ? "green" : frame >= empty && n === 3 ? "green" : undefined) as CodeLine["hl"],
  }));
  return frame < swap + 4 ? (
    <Editor file="book.go · the usual version" lines={old} y={210} />
  ) : (
    <>
      <Editor file="book.go · the fix" lines={fix} y={260} enter={ramp(frame, swap + 4, 8)}
              note="error handling left out here · full code in the free guide" />
      <div style={{ position: "absolute", left: 60, top: 820, opacity: ramp(frame, empty, 8), display: "flex", gap: 20 }}>
        {["check and write: 1 statement", "1 row changed = you got it"].map((t, n) => (
          <div key={t} style={{ opacity: n === 1 ? ramp(frame, exact, 8) : 1, font: `700 30px "${FONT.ui}"`, color: C.green,
                                border: `3px solid ${C.green}`, borderRadius: 999, padding: "12px 24px", background: "#0d1a12" }}>
            {t}
          </div>
        ))}
      </div>
    </>
  );
};

/** Inside Postgres: the row lock, the wait, the re-check on the new row, 0 rows. */
export const Lock: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const locks = at(line, "locks"), waits = at(line, "waits"), recheck = at(line, "re-checks");
  const nothing = at(line, "nothing"), zero = at(line, "0"), lost = at(line, "lost");
  const holder = frame >= locks + 8 ? "ana" : null;
  const draw = (start: number, end = 1) => interpolate(frame, [start, start + 10], [0, end], clamp);
  const check = pop(frame, recheck), cross = pop(frame, nothing), rows = pop(frame, zero);
  const card = (who: string, x: number, color: string, op: number) => (
    <div style={{ position: "absolute", left: x, top: 640, width: 440, opacity: op, borderRadius: 22, background: C.surface,
                  border: `3px solid ${color}`, padding: 18, font: `500 25px/1.45 "${FONT.mono}"`, color: C.text }}>
      <div style={{ font: `800 32px "${FONT.display}"`, color, marginBottom: 6 }}>{who}</div>
      UPDATE seats<br />SET holder = '{who.toLowerCase()}'<br />WHERE id = 42<br />AND holder IS NULL
    </div>
  );
  return (
    <>
      <SeatRow holder={holder} x={350} y={210} lock={pop(frame, locks)} flash={interpolate(frame, [locks + 8, locks + 16], [1, 0], clamp)}
               note={frame >= locks ? "locked by Ana's update" : undefined} />
      {card("Ana", 40, C.green, ramp(frame, 0, 8))}
      {card("Bo", 600, C.amber, ramp(frame, 4, 8))}
      <Arrow a={[260, 640]} b={[420, 470]} progress={draw(locks - 6)} color={C.green} label="first: locks the row" />
      <Arrow a={[820, 640]} b={[660, 470]} progress={draw(waits - 4, frame >= recheck ? 1 : 0.55)} color={C.amber}
             label={frame >= recheck ? "re-check" : "waits ⏳"} />
      <div style={{ position: "absolute", left: 600, top: 900, width: 440, transform: `scale(${check})`, transformOrigin: "top center",
                    borderRadius: 22, background: "#1d1608", border: `3px solid ${C.amber}`, padding: 18,
                    font: `700 28px/1.5 "${FONT.mono}"`, color: C.text }}>
        holder IS NULL ?<br />
        <span style={{ color: C.muted }}>holder = 'ana'</span>
        <span style={{ color: C.red, marginLeft: 16, display: "inline-block", transform: `scale(${cross})` }}>✗ no match</span>
      </div>
      <div style={{ position: "absolute", left: 60, top: 900, transform: `scale(${rows})`, transformOrigin: "left center" }}>
        <Big size={130} color={C.red}>0 rows</Big>
        <div style={{ font: `700 32px "${FONT.ui}"`, color: C.muted }}>for Bo's update</div>
      </div>
      <div style={{ position: "absolute", left: 60, top: 1070, opacity: ramp(frame, lost, 8), display: "flex", gap: 20 }}>
        <div style={{ font: `800 30px "${FONT.display}"`, color: "#0a0d12", background: C.green, borderRadius: 999, padding: "10px 24px" }}>Ana: Booked ✓</div>
        <div style={{ font: `800 30px "${FONT.display}"`, color: "#0a0d12", background: C.red, borderRadius: 999, padding: "10px 24px" }}>Bo: Seat taken ✗</div>
      </div>
    </>
  );
};

export const Proof: React.FC<SceneProps> = ({ line }) => {
  const changed = at(line, "changed"), zero = at(line, "0");
  return (
    <>
      <Terminal y={300} steps={[
        { cmd: "go run . -mode=check-then-write", out: "check-then-write: 1000 seats, 999 sold twice", color: C.red, at: 0 },
        { cmd: "go run . -mode=conditional", out: "conditional: 1000 seats, 0 sold twice", color: C.green, at: changed - 14 },
      ]} />
      <Stamp text="0 SOLD TWICE" color={C.green} at={zero + 4} x={540} y={900} rotate={-6} />
    </>
  );
};

/** Ticketmaster's Eras Tour presale: 3.5 billion requests; at that scale the same millisecond is normal. */
export const Scale: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const num = at(line, "3.5"), same = at(line, "same");
  const value = interpolate(frame, [num - 2, num + 12], [0.1, 3.5], clamp);
  const dots = Array.from({ length: 90 }).map((_, n) => {
    const angle = random(`a${n}`) * Math.PI * 2;
    const speed = 0.6 + random(`s${n}`) * 0.8;
    const phase = (frame * speed * 0.03 + random(`p${n}`)) % 1; // 0 far away → 1 at the seat
    const r = 520 * (1 - phase);
    return { x: 540 + Math.cos(angle) * r, y: 760 + Math.sin(angle) * r * 0.55, hit: frame >= same && phase > 0.92 };
  });
  return (
    <>
      {dots.map((d, n) => (
        <div key={n} style={{ position: "absolute", left: d.x - 7, top: d.y - 7, width: 14, height: 14, borderRadius: 7,
                              background: d.hit ? C.red : C.blue, opacity: 0.85, boxShadow: d.hit ? `0 0 18px ${C.red}` : "none" }} />
      ))}
      <div style={{ position: "absolute", left: 470, top: 690, width: 140, height: 140, borderRadius: 30, background: C.amber,
                    display: "flex", alignItems: "center", justifyContent: "center", font: `800 52px "${FONT.display}"`,
                    color: "#0a0d12", boxShadow: frame >= same ? `0 0 ${40 + 20 * Math.sin(frame / 2)}px ${C.red}` : "none" }}>42</div>
      <div style={{ position: "absolute", left: 60, top: 200, opacity: ramp(frame, 0, 8) }}>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted }}>Ticketmaster · Eras Tour presale · Nov 2022</div>
        <div style={{ opacity: ramp(frame, num - 2, 4), transform: `scale(${0.9 + 0.1 * pop(frame, num - 2)})`, transformOrigin: "left center" }}>
          <Big size={150} color={C.text}>{value.toFixed(1)} billion</Big>
          <div style={{ font: `800 50px "${FONT.display}"`, color: C.blue }}>requests · 4× its previous peak</div>
        </div>
        <div style={{ opacity: 1 - ramp(frame, num - 4, 4), position: "absolute", top: 60 }}>
          <Big size={110} color={C.text}>One presale.</Big>
        </div>
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string }> = ({ line, keyword }) => {
  const frame = useCurrentFrame();
  const comment = at(line, "comment"), guide = at(line, "guide"), back = at(line, "because");
  const typed = keyword.slice(0, Math.max(0, Math.floor((frame - comment - 4) / 3)));
  const dm = pop(frame, guide);
  if (frame >= back) {
    const hot = frame >= at(line, "one", 1) ? 1 : frame >= at(line, "two") ? 0 : -1;
    return (
      <>
        <HookTitle hot={hot} />
        <Phone name="Ana" state="idle" x={40} y={780} />
        <Phone name="Bo" state="idle" x={740} y={780} />
      </>
    );
  }
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The Last Seat · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>3 fixes in real code · PDF</div>
      </div>
    </>
  );
};
