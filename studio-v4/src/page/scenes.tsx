// The nine scenes of Behind the Button #12, "Page 1 is instant. Page 100,000 isn't"
// (content/v4/012-page/script.yaml). Each scene runs from its line's start until the next line
// starts, and times its beats to its line's words. The numbers come from samples/java (java Pages
// <mode>, three runs on 2,000,000 posts in Postgres 16); timings shown are the median of the three.
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

const Title: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 76 }) => (
  <div style={{ position: "absolute", left: 60, top: 175 }}><Big size={size}>{children}</Big></div>
);

type Row = { id: number; time: string; tag?: string; color?: string; strike?: boolean; show?: number };
/** A feed: newest first, one row per post, with a tag on the ones that matter. */
const Feed: React.FC<{ x: number; y: number; title: string; rows: Row[]; width?: number }> = ({ x, y, title, rows, width = 480 }) => (
  <div style={{ position: "absolute", left: x, top: y, width, boxSizing: "border-box", borderRadius: 24, background: C.surface,
                border: `3px solid ${C.border}`, padding: "14px 18px" }}>
    <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted, marginBottom: 8 }}>{title}</div>
    {rows.map((r) => (
      <div key={`${r.id}-${r.tag ?? ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", marginBottom: 6,
                                                   borderRadius: 12, opacity: r.show ?? 1, background: r.color ? `${r.color}22` : "#151b25",
                                                   border: `2px solid ${r.color ?? "transparent"}` }}>
        <span style={{ font: `800 30px "${FONT.mono}"`, color: r.color ?? C.text, textDecoration: r.strike ? `line-through 4px ${C.red}` : "none" }}>post {r.id}</span>
        <span style={{ font: `700 24px "${FONT.mono}"`, color: r.tag ? (r.color ?? C.muted) : C.muted }}>{r.tag ?? r.time}</span>
      </div>
    ))}
  </div>
);

/** The hook (and the loop's last frame). */
export const PageTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["Page 1: instant.", "Page 100,000: 0.27 s."].map((t, n) => (
      <Big key={t} size={88} color={hot === n ? (n === 1 ? C.red : C.yellow) : C.text}
           style={{ marginBottom: 12, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

/** Two timings on one scale: 1 px a millisecond, times 3.5. */
export const Timings: React.FC<{ y: number; deep: number }> = ({ y, deep }) => (
  <div style={{ position: "absolute", left: 40, top: y, width: 1000 }}>
    {[["page 1", 1.6, C.green, 1], ["page 100,000", 266, C.red, deep]].map(([name, ms, color, show]) => (
      <div key={name as string} style={{ marginBottom: 34, opacity: show as number }}>
        <div style={{ display: "flex", justifyContent: "space-between", font: `800 40px "${FONT.display}"`, color: C.text }}>
          <span>{name}</span><span style={{ font: `800 44px "${FONT.mono}"`, color: color as string }}>{(ms as number) < 10 ? `${ms} ms` : `${ms} ms`}</span>
        </div>
        <div style={{ marginTop: 12, height: 40, borderRadius: 20, background: "#1a212c" }}>
          <div style={{ height: 40, borderRadius: 20, width: Math.max(14, (ms as number) * 3.5 * (show as number)), background: color as string }} />
        </div>
      </div>
    ))}
    <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>LIMIT 20 OFFSET … · 2,000,000 posts · median of 3 runs</div>
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const deep = at(line, "100,000"), same = at(line, "same");
  return (
    <>
      <PageTitle hot={frame >= deep ? 1 : 0} />
      <Timings y={480} deep={ramp(frame, deep, 14)} />
      <Stamp text="SAME QUERY" color={C.amber} at={same} x={540} y={900} rotate={-5} />
    </>
  );
};

/** What OFFSET really does: read everything before the page, then throw it away. */
export const Offset: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const twenty = at(line, "20"), million = at(line, "million"), away = at(line, "away");
  const read = Math.round(interpolate(frame, [twenty, million + 6], [0, 1_000_000], clamp));
  return (
    <>
      <Title>OFFSET doesn't jump</Title>
      <Editor file="page 50,000" y={300} enter={ramp(frame, 0, 8)} lines={[
        { text: "SELECT id, created_at FROM posts", sql: true },
        { text: "ORDER BY created_at DESC, id DESC", sql: true },
        { text: "LIMIT 20 OFFSET 999980", sql: true, hl: "red" },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 600, width: 1000, display: "flex", gap: 24 }}>
        {[["rows read", read.toLocaleString("en-US"), C.red], ["rows kept", frame >= twenty ? "20" : "0", C.green]].map(([k, v, color]) => (
          <div key={k} style={{ flex: 1, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, padding: "14px 22px" }}>
            <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>{k}</div>
            <div style={{ font: `800 72px "${FONT.mono}"`, letterSpacing: -3, color }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 60, top: 820, font: `700 28px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, million, 6) }}>
        EXPLAIN ANALYZE: Index Only Scan … rows=1000000
      </div>
      <Stamp text="999,980 THROWN AWAY" color={C.red} at={away} x={540} y={960} rotate={-4} />
    </>
  );
};

const DEPTH: [string, string, string][] = [
  ["1,000", "4.3 ms", "0.8 ms"],
  ["10,000", "26 ms", "0.7 ms"],
  ["50,000", "130 ms", "0.6 ms"],
  ["100,000", "266 ms", "0.9 ms"],
];

/** Keyset: start just after the last post shown. */
export const Keyset: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const time = at(line, "time"), start = at(line, "start"), twenty = at(line, "20");
  return (
    <>
      <Title size={64}>Remember where you stopped</Title>
      <Editor file="the next page, by keyset" y={290} enter={ramp(frame, time - 4, 8)} lines={[
        { text: "SELECT id, created_at FROM posts", sql: true },
        { text: "WHERE (created_at, id) < ($time, $id)", sql: true, hl: frame >= start ? "green" : undefined },
        { text: "ORDER BY created_at DESC, id DESC", sql: true },
        { text: "LIMIT 20", sql: true },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 650, width: 1000, opacity: ramp(frame, twenty, 6) }}>
        <div style={{ display: "flex", font: `700 26px "${FONT.mono}"`, color: C.muted, padding: "0 20px 8px" }}>
          <span style={{ flex: 1 }}>page</span><span style={{ width: 220 }}>OFFSET</span><span style={{ width: 200 }}>keyset</span>
        </div>
        {DEPTH.map(([p, off, key]) => (
          <div key={p} style={{ display: "flex", font: `800 40px "${FONT.mono}"`, padding: "8px 20px", borderTop: `2px solid ${C.border}` }}>
            <span style={{ flex: 1, color: C.text }}>{p}</span>
            <span style={{ width: 220, color: C.red }}>{off}</span>
            <span style={{ width: 200, color: C.green }}>{key}</span>
          </div>
        ))}
        <div style={{ font: `700 24px "${FONT.mono}"`, color: C.muted, padding: "10px 20px" }}>same 20 posts both ways · median of 3 runs</div>
      </div>
    </>
  );
};

/** New posts arrive between pages: OFFSET shows the same posts again. */
export const Drift: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const fresh = at(line, "new"), readers = at(line, "200"), twice = at(line, "4,000");
  const added = frame >= fresh;
  return (
    <>
      <Title size={72}>New posts shift the page</Title>
      <Feed x={40} y={290} title="page 1, as you read it" rows={[
        { id: 2000000, time: "09:41:07" }, { id: 1999999, time: "09:41:07" }, { id: 1999998, time: "09:41:07" },
        { id: 1999997, time: "09:41:06" }]} />
      <Feed x={560} y={290} title={added ? "page 2, after 2 new posts" : "page 2"} rows={added ? [
        { id: 1999998, time: "", tag: "seen already", color: C.amber }, { id: 1999997, time: "", tag: "seen already", color: C.amber },
        { id: 1999996, time: "09:41:06" }, { id: 1999995, time: "09:41:06" }] : [
        { id: 1999996, time: "09:41:06" }, { id: 1999995, time: "09:41:06" }, { id: 1999994, time: "09:41:05" }, { id: 1999993, time: "09:41:05" }]} />
      <div style={{ position: "absolute", left: 60, top: 680, font: `700 26px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, fresh, 6) }}>
        4 posts a page here, to fit; the test used 20
      </div>
      <Chip y={760} color={C.amber} show={ramp(frame, twice, 6)} big="4,443" text="posts shown twice" small="200 readers · 10 pages · keyset: 0" />
      <div style={{ position: "absolute", left: 60, top: 990, font: `700 26px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, readers, 6) }}>
        between pages: 0 to 5 new posts · each reader in a rolled-back transaction
      </div>
    </>
  );
};

/** Posts deleted between pages: OFFSET skips posts nobody saw. */
export const Deleted: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const del = at(line, "delete"), never = at(line, "1,700"), none = at(line, "none");
  const gone = frame >= del;
  return (
    <>
      <Title>Delete one, skip one</Title>
      <Feed x={40} y={290} title="page 1, as you read it" rows={[
        { id: 2000000, time: "09:41:07" }, { id: 1999999, time: "09:41:07", strike: gone, tag: gone ? "deleted" : undefined, color: gone ? C.red : undefined },
        { id: 1999998, time: "09:41:07" }, { id: 1999997, time: "09:41:06" }]} />
      <Feed x={560} y={290} title="page 2" rows={gone ? [
        { id: 1999995, time: "09:41:06" }, { id: 1999994, time: "09:41:05" }, { id: 1999993, time: "09:41:05" }, { id: 1999992, time: "09:41:05" }] : [
        { id: 1999996, time: "09:41:06" }, { id: 1999995, time: "09:41:06" }, { id: 1999994, time: "09:41:05" }, { id: 1999993, time: "09:41:05" }]} />
      <div style={{ position: "absolute", left: 560, top: 640, width: 480, font: `800 36px "${FONT.display}"`, color: C.red, opacity: ramp(frame, del + 8, 6) }}>
        post 1999996: never shown
      </div>
      <Chip y={760} color={C.red} show={ramp(frame, never, 6)} big="1,712" text="posts never shown" small={`200 readers · 10 pages${frame >= none ? " · keyset: 0" : ""}`} />
    </>
  );
};

/** The cursor needs a tie-breaker: posts share a second. */
export const Ties: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const id = at(line, "id"), only = at(line, "only"), skipped = at(line, "skipped");
  return (
    <>
      <Title>Three posts, one second</Title>
      <Feed x={40} y={290} title="end of a page" width={1000} rows={[
        { id: 1999998, time: "09:41:07" }, { id: 1999997, time: "09:41:06 · last shown", color: C.blue }]} />
      <div style={{ position: "absolute", left: 40, top: 520, width: 1000, display: "flex", gap: 24 }}>
        {[["time only", "created_at < 09:41:06", "1999996 and 1999995: skipped", C.red, only],
          ["time and id", "(created_at, id) < (09:41:06, 1999997)", "1999996: shown next", C.green, id]].map(([name, cond, out, color, when]) => (
          <div key={name as string} style={{ flex: 1, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, padding: "16px 20px",
                                             opacity: ramp(frame, when as number, 6) }}>
            <div style={{ font: `800 36px "${FONT.display}"`, color: C.text }}>{name}</div>
            <div style={{ font: `700 22px/1.4 "${FONT.mono}"`, color: C.amber, marginTop: 8 }}>{cond}</div>
            <div style={{ font: `800 30px "${FONT.mono}"`, color: color as string, marginTop: 12 }}>{out}</div>
          </div>
        ))}
      </div>
      <Chip y={800} color={C.red} show={ramp(frame, skipped, 6)} big="499" text="of 10,000 posts skipped" small="3 posts a second · with the id: 0" />
    </>
  );
};

/** "Page 3 of 100,000" costs a full count. */
export const Count: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const count = at(line, "count"), ms = at(line, "200"), estimate = at(line, "estimate");
  return (
    <>
      <Title>"Page 3 of 100,000"</Title>
      <div style={{ position: "absolute", left: 40, top: 300, width: 1000, display: "flex", gap: 14, justifyContent: "center" }}>
        {["‹", "1", "2", "3", "…", "100,000", "›"].map((t) => (
          <div key={t} style={{ minWidth: 70, textAlign: "center", padding: "14px 18px", borderRadius: 16, font: `800 38px "${FONT.mono}"`,
                                background: t === "3" ? C.blue : C.surface, color: t === "3" ? C.bg : C.text, border: `3px solid ${C.border}` }}>{t}</div>
        ))}
      </div>
      <Chip y={460} color={C.red} show={ramp(frame, count, 6)} big={frame >= ms ? "~200 ms" : "…"} text="SELECT count(*) FROM posts" small="2,000,000 rows · 3 runs: 156 to 245 ms" />
      <Chip y={680} color={C.green} show={ramp(frame, estimate, 6)} big="~1 ms" text="the planner's estimate" small="reltuples in pg_class · about right, not exact" />
    </>
  );
};

/** The real case: Slack's own write-up. */
export const Slack: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const slack = at(line, "slack"), offsets = at(line, "offsets"), cursors = at(line, "cursors");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, slack, 6) }}>
        <Big size={84}>Slack, 2017</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 10 }}>Michael Hahn, "Evolving API Pagination at Slack"</div>
      </div>
      {[["offsets don't scale for large datasets", C.red, offsets], ["frequent writes: skipped or duplicate results", C.red, offsets + 8],
        ["so: a cursor, and next_cursor in every reply", C.green, Math.max(cursors, offsets + 16)]].map(([t, color, when], i) => (
        <div key={t as string} style={{ position: "absolute", left: 40, top: 380 + i * 150, width: 1000, boxSizing: "border-box", borderRadius: 22,
                                        background: C.surface, border: `3px solid ${color}`, padding: "20px 26px", opacity: ramp(frame, when as number, 6),
                                        font: `800 40px/1.2 "${FONT.display}"`, color: C.text }}>{t}</div>
      ))}
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const million = at(line, "million");
    return (
      <>
        <PageTitle hot={frame >= million ? 1 : 0} />
        <Timings y={480} deep={1} />
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 Page After Page · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>real Java + SQL, every case tested · PDF</div>
      </div>
    </>
  );
};
