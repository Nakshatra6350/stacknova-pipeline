// The pieces every look v4 video is built from: the frame chrome, captions, phones, a table row,
// arrows, stamps, an editor and a terminal. 1080 x 1920; the stage is y 170..1100, captions sit
// at y 1150..1400, and the bottom 500 px stay clear of Instagram's and YouTube's own buttons.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import { C, FONT } from "./theme";
import { FPS, Line, Timeline, frames } from "./timeline";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 with a small overshoot, starting at frame `at`. A plain function of the frame (not a
 * hook), so scenes can call it inside conditions. */
export function pop(frame: number, at: number, config = { damping: 14, stiffness: 180 }): number {
  return spring({ frame: frame - at, fps: FPS, config });
}

/** 0 → 1 smoothly over `len` frames from `at`. */
export function ramp(frame: number, at: number, len = 8): number {
  return interpolate(frame, [at, at + len], [0, 1], clamp);
}

export const Backdrop: React.FC<{ glow: string }> = ({ glow }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    <AbsoluteFill style={{ background: `radial-gradient(900px 700px at 50% 34%, ${glow}22, transparent 70%)` }} />
    <AbsoluteFill style={{
      backgroundImage: `radial-gradient(${C.border} 1.6px, transparent 1.6px)`,
      backgroundSize: "44px 44px", opacity: 0.55,
    }} />
  </AbsoluteFill>
);

export const TopBar: React.FC<{ episode: string }> = ({ episode }) => (
  <div style={{ position: "absolute", left: 54, right: 54, top: 58, display: "flex", alignItems: "center",
                justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Img src={staticFile("emblem.jpg")} style={{ width: 58, height: 58, borderRadius: 14 }} />
      <span style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>
        Stack<span style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.orange} 55%, ${C.gold})`,
          WebkitBackgroundClip: "text", color: "transparent" }}>Nova</span>
      </span>
    </div>
    <span style={{ font: `700 24px "${FONT.mono}"`, letterSpacing: 2, color: C.muted, border: `2px solid ${C.border}`,
                   borderRadius: 999, padding: "10px 20px", background: C.surface }}>
      BEHIND THE BUTTON · {episode}
    </span>
  </div>
);

/** Caption chunks: at most 3 words, or fewer when a word ends a sentence or clause. */
function chunks(line: Line): { words: Line["words"]; s: number; e: number }[] {
  const out: { words: Line["words"]; s: number; e: number }[] = [];
  let cur: Line["words"] = [];
  for (const w of line.words) {
    cur.push(w);
    const chars = cur.map((x) => x.w).join(" ").length;
    if (cur.length === 3 || /[.?!:,]$/.test(w.w) || chars > 18) {
      out.push({ words: cur, s: cur[0].s, e: w.e });
      cur = [];
    }
  }
  if (cur.length) out.push({ words: cur, s: cur[0].s, e: cur[cur.length - 1].e });
  return out;
}

/** Captions for every line but the hook (its title card is its caption), until `until` seconds. */
export const Captions: React.FC<{ timeline: Timeline; until: number }> = ({ timeline, until }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t >= until) return null;
  const all = timeline.lines.filter((l) => l.scene !== "hook").flatMap(chunks);
  // the chunk being said, or the last one said, until the next starts
  const i = all.findIndex((c, n) => t >= c.s - 0.05 && (n === all.length - 1 || t < all[n + 1].s - 0.05));
  if (i < 0 || t > timeline.duration - 0.1) return null;
  const chunk = all[i];
  const enter = interpolate(t, [chunk.s - 0.05, chunk.s + 0.08], [0.9, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 1150, height: 250, display: "flex",
                  alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ transform: `scale(${enter})`, font: `800 82px/1.08 "${FONT.display}"`, letterSpacing: -1,
                    color: C.text, textShadow: "0 6px 28px rgba(0,0,0,.85), 0 2px 0 rgba(0,0,0,.9)" }}>
        {chunk.words.map((w, n) => (
          <span key={n} style={{ color: t >= w.s && t < w.e + 0.05 ? C.yellow : C.text }}>{w.w} </span>
        ))}
      </div>
    </div>
  );
};

type PhoneState = "idle" | "loading" | "booked" | "taken";
export const Phone: React.FC<{ name: string; state: PhoneState; x: number; y: number; scale?: number; tap?: number }> =
  ({ name, state, x, y, scale = 1, tap = 0 }) => {
    const button = { idle: [C.blue, "Book seat 42"], loading: [C.raised, "Booking…"],
                     booked: [C.green, "Booked ✓"], taken: [C.red, "Seat taken ✗"] }[state];
    return (
      <div style={{ position: "absolute", left: x, top: y, width: 300, height: 540, transform: `scale(${scale})`,
                    transformOrigin: "center", borderRadius: 48, background: "#06080c", border: `4px solid #2d3644`,
                    boxShadow: "0 30px 60px rgba(0,0,0,.55)", padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ alignSelf: "center", width: 90, height: 22, borderRadius: 999, background: "#000" }} />
        <div style={{ font: `700 26px "${FONT.ui}"`, color: C.muted }}>{name}</div>
        <div style={{ borderRadius: 22, background: C.surface, border: `2px solid ${C.border}`, padding: 18 }}>
          <div style={{ font: `700 22px "${FONT.ui}"`, color: C.muted }}>Last seat left</div>
          <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, whiteSpace: "nowrap" }}>Row F · 42</div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {Array.from({ length: 28 }).map((_, n) => (
              <div key={n} style={{ height: 22, borderRadius: "6px 6px 3px 3px",
                                    background: n === 24 ? C.amber : "#2a3240", opacity: n === 24 ? 1 : 0.75,
                                    boxShadow: n === 24 ? `0 0 14px ${C.amber}` : "none" }} />
            ))}
          </div>
        </div>
        <div style={{ marginTop: "auto", borderRadius: 22, padding: "22px 0", textAlign: "center",
                      transform: `scale(${1 - 0.07 * tap})`, background: button[0],
                      font: `800 30px "${FONT.display}"`, color: state === "loading" ? C.muted : "#0a0d12" }}>
          {button[1]}
        </div>
      </div>
    );
  };

/** The seats table with one row, as a database card. */
export const SeatRow: React.FC<{ holder: string | null; x: number; y: number; flash?: number; lock?: number; note?: string }> =
  ({ holder, x, y, flash = 0, lock = 0, note }) => (
    <div style={{ position: "absolute", left: x, top: y, width: 380, borderRadius: 26, background: C.surface,
                  border: `3px solid ${C.border}`, boxShadow: "0 24px 50px rgba(0,0,0,.5)", overflow: "hidden" }}>
      <div style={{ padding: "16px 22px", background: C.raised, font: `700 26px "${FONT.mono}"`, color: C.purple,
                    display: "flex", justifyContent: "space-between" }}>
        <span>seats</span><span style={{ color: C.muted }}>postgres</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", font: `500 24px "${FONT.mono}"`, color: C.muted,
                    padding: "12px 22px 6px" }}>
        <span>id</span><span>holder</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 22px 20px",
                    font: `700 34px "${FONT.mono}"`, color: C.text,
                    background: `rgba(227,179,65,${0.28 * flash})` }}>
        <span>42</span>
        <span style={{ color: holder ? C.text : C.muted }}>{holder ?? "NULL"}</span>
      </div>
      {lock > 0 && (
        <div style={{ position: "absolute", right: 16, bottom: 14, transform: `scale(${lock})`, font: `800 40px "${FONT.ui}"` }}>
          🔒
        </div>
      )}
      {note && <div style={{ padding: "0 22px 18px", font: `700 22px "${FONT.mono}"`, color: C.amber }}>{note}</div>}
    </div>
  );

/** An arrow drawn from a to b as `progress` goes 0 → 1, with an optional label pill at its middle. */
export const Arrow: React.FC<{ a: [number, number]; b: [number, number]; progress: number; color: string; label?: string }> =
  ({ a, b, progress, color, label }) => {
    if (progress <= 0) return null;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const end: [number, number] = [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
    const mid: [number, number] = [(a[0] + end[0]) / 2, (a[1] + end[1]) / 2];
    return (
      <>
        <svg style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, overflow: "visible" }}>
          <line x1={a[0]} y1={a[1]} x2={end[0]} y2={end[1]} stroke={color} strokeWidth={7} strokeLinecap="round"
                strokeDasharray={`${len} ${len}`} />
          <polygon points="0,-14 26,0 0,14" fill={color}
                   transform={`translate(${end[0]},${end[1]}) rotate(${(angle * 180) / Math.PI}) translate(-18,0)`} />
        </svg>
        {label && progress > 0.4 && (
          <div style={{ position: "absolute", left: mid[0], top: mid[1], transform: "translate(-50%,-50%)",
                        font: `700 26px "${FONT.mono}"`, color: "#0a0d12", background: color, borderRadius: 12,
                        padding: "6px 14px", whiteSpace: "nowrap", boxShadow: "0 8px 20px rgba(0,0,0,.5)" }}>
            {label}
          </div>
        )}
      </>
    );
  };

export const Stamp: React.FC<{ text: string; color: string; at: number; x: number; y: number; rotate?: number }> =
  ({ text, color, at, x, y, rotate = -9 }) => {
    const p = pop(useCurrentFrame(), at, { damping: 11, stiffness: 220 });
    if (p <= 0.001) return null;
    return (
      <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) rotate(${rotate}deg) scale(${2.2 - 1.2 * p})`,
                    opacity: Math.min(1, p * 1.5), border: `8px solid ${color}`, color, borderRadius: 18,
                    padding: "10px 30px", font: `800 76px "${FONT.display}"`, letterSpacing: 2, background: "rgba(10,13,18,.82)" }}>
        {text}
      </div>
    );
  };

const GO_KEYWORDS = new Set(["func", "var", "if", "return", "nil", "true", "false", "err", "bool", "int", "string", "go"]);
/** One line of Go with SQL in backticks, in editor colours. */
function paint(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]*`?|\/\/.*$|"[^"]*"|\b\d+\b|\b[A-Za-z_][A-Za-z0-9_]*\b|\s+|.)/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(code))) {
    const tok = m[0];
    let color = C.text;
    if (tok.startsWith("`")) color = C.amber;
    else if (tok.startsWith("//")) color = C.muted;
    else if (tok.startsWith('"')) color = C.amber;
    else if (/^\d+$/.test(tok)) color = C.purple;
    else if (GO_KEYWORDS.has(tok)) color = C.pink;
    else if (/^[A-Z]/.test(tok)) color = C.blue;
    out.push(<span key={n++} style={{ color }}>{tok}</span>);
  }
  return out;
}

export type CodeLine = { text: string; hl?: "red" | "green" | "amber"; dim?: boolean; strike?: boolean };
export const Editor: React.FC<{ file: string; lines: CodeLine[]; x?: number; y?: number; width?: number; note?: string; enter?: number }> =
  ({ file, lines, x = 40, y = 240, width = 1000, note, enter = 1 }) => (
    <div style={{ position: "absolute", left: x, top: y, width, borderRadius: 26, background: "#0d1117",
                  border: `3px solid ${C.border}`, boxShadow: "0 30px 70px rgba(0,0,0,.6)", overflow: "hidden",
                  opacity: enter, transform: `translateY(${(1 - enter) * 60}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", background: C.raised,
                    borderBottom: `2px solid ${C.border}` }}>
        {[C.red, C.amber, C.green].map((c) => <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />)}
        <span style={{ marginLeft: 16, font: `700 24px "${FONT.mono}"`, color: C.muted }}>{file}</span>
      </div>
      <div style={{ padding: "18px 0" }}>
        {lines.map((l, n) => (
          <div key={n} style={{ display: "flex", padding: "3px 22px", whiteSpace: "pre",
                                font: `400 29px/1.5 "${FONT.mono}"`, opacity: l.dim ? 0.35 : 1,
                                textDecoration: l.strike ? `line-through 4px ${C.red}` : "none",
                                background: l.hl ? `${{ red: C.red, green: C.green, amber: C.amber }[l.hl]}26` : "transparent",
                                boxShadow: l.hl ? `inset 8px 0 0 ${{ red: C.red, green: C.green, amber: C.amber }[l.hl]}` : "none" }}>
            <span style={{ width: 46, color: "#4b5566", textAlign: "right", marginRight: 22 }}>{n + 1}</span>
            <span>{paint(l.text)}</span>
          </div>
        ))}
      </div>
      {note && <div style={{ padding: "0 22px 18px", font: `500 22px "${FONT.mono}"`, color: C.muted }}>{note}</div>}
    </div>
  );

/** A terminal that types each command, then prints its output, from the given frames on. */
export const Terminal: React.FC<{ steps: { cmd: string; out: string; color: string; at: number }[]; y?: number }> =
  ({ steps, y = 300 }) => {
    const frame = useCurrentFrame();
    return (
      <div style={{ position: "absolute", left: 40, top: y, width: 1000, borderRadius: 26, background: "#05070a",
                    border: `3px solid ${C.border}`, boxShadow: "0 30px 70px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", background: C.raised }}>
          {[C.red, C.amber, C.green].map((c) => <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />)}
          <span style={{ marginLeft: 16, font: `700 24px "${FONT.mono}"`, color: C.muted }}>~/last-seat · postgres 16</span>
        </div>
        <div style={{ padding: "26px 28px", font: `500 33px/1.55 "${FONT.mono}"`, minHeight: 420, whiteSpace: "pre-wrap" }}>
          {steps.map((s, n) => {
            const typed = Math.max(0, Math.min(s.cmd.length, Math.floor((frame - s.at) * 2.2)));
            const done = frame >= s.at + s.cmd.length / 2.2 + 6;
            if (frame < s.at) return null;
            return (
              <div key={n} style={{ marginBottom: 18 }}>
                <div style={{ color: C.text }}><span style={{ color: C.green }}>$ </span>{s.cmd.slice(0, typed)}
                  {!done && <span style={{ background: C.text }}>&nbsp;</span>}</div>
                {done && <div style={{ color: s.color, fontWeight: 700 }}>{s.out}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

export const lineFrames = (line: Line) => ({ from: frames(line.start), to: frames(line.end) });
