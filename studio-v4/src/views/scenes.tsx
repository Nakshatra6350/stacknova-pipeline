// The ten scenes of Behind the Button #4, "One more view, and the counter goes negative"
// (content/v4/004-views/script.yaml). Each scene runs from its line's start until the next line starts,
// and times its beats to its line's words. The numbers and error messages are real: java Views wrap,
// alter-only, alter-lock and online (samples/java/Views.java).
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { CodeLine, Editor, Stamp, Terminal, clamp, pop, ramp } from "../ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

const INT_MAX = "2,147,483,647";
const INT_MIN = "-2,147,483,648";

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

/** A video player: a dark picture, a play button and the count underneath. */
export const ViewCard: React.FC<{ count: string; broken?: number; plus?: number; x?: number; y: number; title?: string; shake?: number }> =
  ({ count, broken = 0, plus = 0, x = 40, y, title = "The most watched video on the site", shake = 0 }) => {
    const color = broken > 0 ? C.red : C.yellow;
    return (
      <div style={{ position: "absolute", left: x, top: y, width: 1000, borderRadius: 30, background: C.surface,
                    border: `3px solid ${broken > 0 ? C.red : C.border}`, overflow: "hidden",
                    boxShadow: `0 30px 60px rgba(0,0,0,.55), 0 0 ${60 * broken}px ${C.red}66`,
                    transform: `translateX(${shake}px)` }}>
        <div style={{ height: 250, position: "relative", background: `linear-gradient(120deg, #1a2236, #2a1f3d 60%, #3a1d2c)` }}>
          <div style={{ position: "absolute", left: 455, top: 80, width: 90, height: 90, borderRadius: 45, background: "rgba(255,255,255,.14)",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 0, height: 0, marginLeft: 8, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: `34px solid ${C.text}` }} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: "#2d3644" }}>
            <div style={{ width: "62%", height: "100%", background: C.red }} />
          </div>
        </div>
        <div style={{ padding: "22px 30px 26px" }}>
          <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>{title}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 8, whiteSpace: "nowrap" }}>
            <span style={{ font: `800 104px "${FONT.mono}"`, letterSpacing: -5, color }}>{count}</span>
          </div>
          <div style={{ font: `700 34px "${FONT.ui}"`, color: broken > 0 ? C.red : C.muted, marginTop: 2 }}>views</div>
        </div>
        {plus > 0.001 && broken === 0 && (
          <div style={{ position: "absolute", right: 34, top: 24, transform: `scale(${plus})`, borderRadius: 999, background: C.green,
                        padding: "8px 26px", font: `800 56px "${FONT.display}"`, color: "#0a0d12" }}>+1</div>
        )}
      </div>
    );
  };

/** The hook (and the loop's last frame). */
export const ViewsTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["One more view.", "It goes negative."].map((t, n) => (
      <Big key={t} size={124} color={hot === n ? (n === 1 ? C.red : C.yellow) : C.text}
           style={{ marginBottom: 12, transform: `scale(${hot === n ? 1.03 : 1})`, transformOrigin: "left center", whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const view = at(line, "view"), negative = at(line, "goes");
  const flipped = frame >= negative;
  const shake = flipped ? interpolate(frame, [negative, negative + 14], [14, 0], clamp) * Math.sin(frame * 2.6) : 0;
  return (
    <>
      <ViewsTitle hot={flipped ? 1 : 0} />
      <ViewCard y={520} count={flipped ? INT_MIN : INT_MAX} broken={flipped ? 1 : 0} plus={pop(frame, view)} shake={shake} />
    </>
  );
};

/** The count climbs to the limit: Gangnam Style in 2014. */
export const Stakes: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const year = at(line, "2014"), there = at(line, "there");
  const share = interpolate(frame, [year, there], [0.42, 1], clamp);
  const count = Math.round(2147483647 * share);
  const full = frame >= there;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 190, opacity: ramp(frame, 0, 8) }}>
        <Big size={78} color={C.muted}>the limit of 32 bits</Big>
        <div style={{ font: `800 136px "${FONT.mono}"`, letterSpacing: -7, color: C.yellow, marginTop: 8, transform: `scale(${pop(frame, 0)})`, transformOrigin: "left center" }}>{INT_MAX}</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 500, width: 1000, opacity: ramp(frame, year - 3, 7), borderRadius: 28,
                    background: C.surface, border: `3px solid ${full ? C.red : C.border}`, padding: 30 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ font: `800 50px "${FONT.display}"`, color: C.text }}>PSY · Gangnam Style</div>
          <div style={{ font: `700 34px "${FONT.mono}"`, color: C.muted }}>2014</div>
        </div>
        <div style={{ font: `800 88px "${FONT.mono}"`, letterSpacing: -4, marginTop: 20, color: full ? C.red : C.text }}>{count.toLocaleString("en-US")}</div>
        <div style={{ position: "relative", marginTop: 22, height: 42, borderRadius: 21, background: "#1a212c", overflow: "hidden" }}>
          <div style={{ width: `${share * 100}%`, height: "100%", background: full ? C.red : C.blue }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, font: `700 28px "${FONT.mono}"`, color: C.muted }}>
          <span>0</span><span style={{ color: full ? C.red : C.muted }}>the top ↑</span>
        </div>
      </div>
    </>
  );
};

/** 32 switches: the first is the sign. */
export const Switches: React.FC<{ on: (n: number) => boolean; y: number; hot?: number; signColor?: string; size?: number }> =
  ({ on, y, hot = -1, signColor = C.amber, size = 106 }) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
      {Array.from({ length: 32 }).map((_, n) => {
        const lit = on(n);
        const shade = n === 0 ? signColor : C.green;
        return (
          <div key={n} style={{ height: size * 0.72, borderRadius: 14, background: lit ? `${shade}2e` : "#121822",
                                border: `3px solid ${lit || n === hot ? shade : C.border}`,
                                boxShadow: n === hot ? `0 0 26px ${shade}` : "none",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                font: `800 ${size * 0.42}px "${FONT.mono}"`, color: lit ? shade : "#4b5566" }}>
            {lit ? "1" : "0"}
          </div>
        );
      })}
    </div>
  );

export const Bits: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const sign = at(line, "sign"), turn = at(line, "turn"), top = at(line, "top");
  // a wave across the 31 switches that aren't the sign
  const lit = (n: number) => n > 0 && frame >= turn + (n - 1) * 0.75;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 190, display: "flex", alignItems: "baseline", gap: 22 }}>
        <Big size={104}>32 switches</Big>
        <span style={{ font: `700 36px "${FONT.ui}"`, color: C.muted }}>a Java int</span>
      </div>
      <Switches on={lit} y={340} hot={frame >= sign && frame < turn ? 0 : -1} />
      <div style={{ position: "absolute", left: 40, top: 690, opacity: ramp(frame, sign, 6), transform: `scale(${pop(frame, sign)})`, transformOrigin: "left top" }}>
        <div style={{ font: `800 46px "${FONT.display}"`, color: C.amber }}>↑ the sign: 0 is plus, 1 is minus</div>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 790, textAlign: "center", transform: `scale(${pop(frame, top)})` }}>
        <div style={{ font: `800 136px "${FONT.mono}"`, letterSpacing: -7, color: C.green }}>{INT_MAX}</div>
        <div style={{ font: `700 36px "${FONT.ui}"`, color: C.muted, marginTop: 4 }}>2³¹ − 1: every switch on but the sign</div>
      </div>
    </>
  );
};

const WRAP: CodeLine[] = [
  { text: "int views = Integer.MAX_VALUE;" },
  { text: "views++;" },
  { text: "System.out.println(views);" },
];

export const Wrap: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const flip = at(line, "flip"), error = at(line, "error"), counts = at(line, "counts");
  // the carry runs along from the last switch to the sign
  const flipped = (n: number) => frame >= flip + (31 - n) * 0.6;
  const allFlipped = flipped(0);
  return (
    <>
      <Switches on={(n) => (n === 0 ? flipped(0) : !flipped(n))} y={175} signColor={C.red} size={92} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 480, textAlign: "center", font: `800 120px "${FONT.mono}"`, letterSpacing: -6, color: allFlipped ? C.red : C.green }}>
        {allFlipped ? INT_MIN : INT_MAX}
      </div>
      <Editor file="Views.java" y={640} enter={ramp(frame, error - 8, 8)}
              lines={WRAP.map((l, n) => ({ ...l, hl: frame >= error && n === 1 ? "red" : undefined }))} />
      <div style={{ position: "absolute", left: 40, top: 900, width: 1000, opacity: ramp(frame, counts, 6), borderRadius: 20, background: "#05070a",
                    border: `3px solid ${C.border}`, padding: "16px 28px", font: `700 46px "${FONT.mono}"`, color: C.red }}>
        <span style={{ color: C.green }}>$ </span>-2147483648
      </div>
      <Stamp text="NO ERROR" color={C.red} at={error} x={540} y={1060} rotate={-5} />
    </>
  );
};

/** YouTube moved to 64 bits: the same picture, twice as many switches. */
export const Youtube: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const coming = at(line, "coming"), moved = at(line, "moved"), room = at(line, "room");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 180, opacity: ramp(frame, 0, 8) }}>
        <Big size={76}>YouTube, December 2014</Big>
      </div>
      <div style={{ position: "absolute", left: 60, top: 280, width: 960, opacity: ramp(frame, coming - 4, 8), borderLeft: `8px solid ${C.blue}`, paddingLeft: 26 }}>
        <div style={{ font: `700 42px/1.25 "${FONT.ui}"`, color: C.text }}>"...but that was before we met PSY."</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>YouTube's own post. A Google spokesman: "Nothing actually broke."</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 500, width: 1000, opacity: ramp(frame, moved - 4, 8) }}>
        <div style={{ font: `800 40px "${FONT.mono}"`, color: C.muted, marginBottom: 12 }}>32 bits</div>
        <div style={{ height: 40, width: 500, borderRadius: 12, background: `${C.red}66`, border: `3px solid ${C.red}` }} />
        <div style={{ font: `800 40px "${FONT.mono}"`, color: C.green, margin: "24px 0 12px" }}>64 bits</div>
        <div style={{ height: 40, width: 1000 * ramp(frame, moved, 14), borderRadius: 12, background: `${C.green}66`, border: `3px solid ${C.green}` }} />
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 800, textAlign: "center", transform: `scale(${pop(frame, room)})` }}>
        <div style={{ font: `800 68px "${FONT.mono}"`, letterSpacing: -3, color: C.green, whiteSpace: "nowrap" }}>9,223,372,036,854,775,807</div>
        <div style={{ font: `800 50px "${FONT.display}"`, color: C.text, marginTop: 10 }}>9 quintillion views</div>
      </div>
    </>
  );
};

/** The fix most of us write first: still refused, and it froze the table. */
export const Bug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const tested = at(line, "tested"), first = at(line, "1,000"), still = at(line, "still"), froze = at(line, "froze"), secs = at(line, "14");
  const seen = Math.round(interpolate(frame, [first, still], [0, 1000], clamp));
  const refused = Math.round(interpolate(frame, [still - 2, still + 14], [0, 1000], clamp));
  const timer = interpolate(frame, [froze, secs + 8], [0, 14.2], clamp);
  return (
    <>
      <Editor file="the obvious fix" y={165} enter={ramp(frame, 0, 8)}
              lines={[{ text: "ALTER TABLE videos", sql: true }, { text: "  ALTER COLUMN id TYPE BIGINT;", sql: true, hl: frame < tested ? "amber" : undefined }]} />
      <div style={{ opacity: ramp(frame, first - 3, 7) }}>
        <div style={{ position: "absolute", left: 60, top: 390, display: "flex", alignItems: "baseline", gap: 18 }}>
          <Big size={150} color={refused > 0 ? C.red : C.text}>{(refused > 0 ? refused : seen).toLocaleString("en-US")}</Big>
          <Big size={46} color={C.muted}>{refused > 0 ? "of 1,000 inserts refused" : "inserts, at the limit"}</Big>
        </div>
        <div style={{ position: "absolute", left: 40, top: 560, width: 1000, opacity: ramp(frame, still + 2, 6), borderRadius: 18, background: "#05070a",
                      border: `3px solid ${C.red}`, padding: "16px 22px", font: `500 30px/1.3 "${FONT.mono}"`, color: C.red }}>
          ERROR: nextval: reached maximum value of sequence "videos_id_seq" (2147483647)
        </div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 720, width: 1000, opacity: ramp(frame, froze - 3, 6), borderRadius: 26, background: C.surface,
                    border: `3px solid ${C.amber}`, padding: 26, display: "flex", alignItems: "center", gap: 30 }}>
        <div style={{ font: `800 130px "${FONT.mono}"`, letterSpacing: -5, color: C.amber, width: 460, whiteSpace: "nowrap" }}>{timer.toFixed(1)} s</div>
        <div>
          <div style={{ font: `800 44px/1.1 "${FONT.display}"`, color: C.text }}>🔒 nothing gets through</div>
          <div style={{ font: `600 28px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>my test: 5 million rows · a small table</div>
        </div>
      </div>
    </>
  );
};

const FIX: CodeLine[] = [
  { text: "ALTER TABLE videos ADD COLUMN id_big BIGINT;", sql: true },
  { text: "-- a trigger copies each new write", sql: true },
  { text: "UPDATE videos SET id_big = id", sql: true },
  { text: "  WHERE id >= ? AND id < ?;  -- 10,000 at a time", sql: true },
  { text: "BEGIN;  -- a moment, not a rewrite", sql: true },
  { text: "ALTER SEQUENCE videos_id_seq AS BIGINT;", sql: true },
  { text: "ALTER TABLE videos RENAME id TO id_int;", sql: true },
  { text: "ALTER TABLE videos RENAME id_big TO id;", sql: true },
  { text: "COMMIT;", sql: true },
];

export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const sequence = at(line, "sequence"), add = at(line, "add"), copy = at(line, "copy"), swap = at(line, "swap");
  const lines = FIX.map((l, n) => {
    let hl: CodeLine["hl"];
    if (frame >= sequence && frame < add && n === 5) hl = "amber";
    if (frame >= add && frame < copy && n <= 1) hl = "green";
    if (frame >= copy && frame < swap && (n === 2 || n === 3)) hl = "green";
    if (frame >= swap && n >= 4) hl = "green";
    return { ...l, hl };
  });
  const filled = interpolate(frame, [copy, swap], [0, 1], clamp);
  const swapped = frame >= swap + 8;
  const column = (name: string, type: string, x: number, share: number, color: string, enter: number, gone: boolean) => (
    <div style={{ position: "absolute", left: x, top: 735, width: 480, opacity: enter * (gone ? 0.35 : 1), borderRadius: 22, background: C.surface,
                  border: `3px solid ${color}`, padding: "16px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", font: `700 34px "${FONT.mono}"`, color: C.text }}>
        <span>{name}</span><span style={{ color, fontSize: 28 }}>{type}</span>
      </div>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 6 }}>
        {Array.from({ length: 30 }).map((_, n) => (
          <div key={n} style={{ height: 26, borderRadius: 5, background: n / 30 < share ? color : "#1a212c" }} />
        ))}
      </div>
    </div>
  );
  return (
    <>
      <Editor file="the fix that works" lines={lines} y={160} enter={ramp(frame, 0, 8)} />
      {column(swapped ? "id_int" : "id", "INTEGER", 40, 1, C.muted, ramp(frame, add - 4, 8), swapped)}
      {column(swapped ? "id" : "id_big", "BIGINT", 560, filled, C.green, ramp(frame, add, 8), false)}
      <div style={{ position: "absolute", left: 40, right: 40, top: 985, textAlign: "center", opacity: ramp(frame, swap + 6, 6),
                    font: `800 46px "${FONT.display}"`, color: C.green }}>writes keep flowing the whole time</div>
    </>
  );
};

export const Proof: React.FC<SceneProps> = ({ line }) => {
  const zero = at(line, "0"), wait = at(line, "longest");
  return (
    <>
      <Terminal y={190} title="~/views · java + postgres 16 · 5M rows" steps={[
        { cmd: "java Views alter-lock", out: "longest write wait 14174 ms", color: C.red, at: -30 },
        { cmd: "java Views online", out: "longest write wait 371 ms\nfailed 0, every row kept", color: C.green, at: 2 },
      ]} />
      <Stamp text="0 REFUSED" color={C.green} at={zero + 2} x={540} y={780} rotate={-6} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 900, textAlign: "center", opacity: ramp(useCurrentFrame(), wait, 8),
                    font: `800 50px "${FONT.display}"`, color: C.text }}>14 seconds → under half a second</div>
    </>
  );
};

/** The real outage: Basecamp's own postmortem, November 2018. */
export const Basecamp: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const year = at(line, "2018"), events = at(line, "same"), read = at(line, "read-only"), five = at(line, "5");
  const stretch = interpolate(frame, [read, five + 10], [0, 1], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 180, opacity: ramp(frame, 0, 8) }}>
        <Big size={80}>Basecamp, 2018</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 10, opacity: ramp(frame, year, 8) }}>their own postmortem</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 340, width: 1000, opacity: ramp(frame, events - 2, 7), borderRadius: 24, background: C.surface,
                    border: `3px solid ${C.red}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 24px", background: C.raised, font: `700 30px "${FONT.mono}"`, color: C.purple }}>events</div>
        <div style={{ padding: "16px 24px", font: `800 96px "${FONT.mono}"`, letterSpacing: -4, color: C.red, whiteSpace: "nowrap" }}>{INT_MAX}</div>
        <div style={{ padding: "0 24px 18px", font: `700 30px "${FONT.ui}"`, color: C.muted }}>the ceiling: no new event could be written</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 680, width: 1000, opacity: ramp(frame, read - 3, 7) }}>
        <div style={{ display: "flex", justifyContent: "space-between", font: `700 40px "${FONT.mono}"`, color: C.text }}>
          <span>7:21 am</span><span style={{ color: stretch >= 1 ? C.green : C.muted }}>12:11 pm</span>
        </div>
        <div style={{ marginTop: 12, height: 54, borderRadius: 16, background: "#1a212c", overflow: "hidden" }}>
          <div style={{ width: `${stretch * 100}%`, height: "100%", background: `repeating-linear-gradient(45deg, ${C.red}, ${C.red} 18px, #a8332d 18px, #a8332d 36px)` }} />
        </div>
        <div style={{ font: `800 58px "${FONT.display}"`, color: C.red, marginTop: 18 }}>🔒 read-only, for almost 5 hours</div>
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const one = at(line, "one", 2);
    return (
      <>
        <ViewsTitle hot={frame >= one ? 0 : -1} />
        <ViewCard y={520} count={INT_MAX} plus={pop(frame, one)} />
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The 2-Billion Limit · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>19 cases, each tested, in real Java + SQL · PDF</div>
      </div>
    </>
  );
};
