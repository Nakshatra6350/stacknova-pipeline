// The eight scenes of Behind the Button #9, "Netflix tested a player that mostly ignores your speed"
// (content/v4/009-buffer/script.yaml). Each scene runs from its line's start until the next line
// starts, and times its beats to its line's words. The numbers come from go run . -mode=pickers
// (samples/go): real pieces made by ffmpeg, simulated connections.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { Stamp, clamp, pop, ramp } from "../ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

// from the runs (see content/v4/009-buffer/script.yaml, fact_check)
export const RESULT = { speedStalls: 655, bufferStalls: 95, speedKbps: 3031, bufferKbps: 3406 };

const LADDER = [
  { name: "1080p", kbps: "5.8 Mbps", color: C.green },
  { name: "720p", kbps: "3 Mbps", color: C.green },
  { name: "540p", kbps: "1.5 Mbps", color: C.amber },
  { name: "360p", kbps: "0.75 Mbps", color: C.amber },
  { name: "270p", kbps: "0.3 Mbps", color: C.red },
];

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

/** A video player: the picture, its quality, and the bar with what's already downloaded. */
export const Player: React.FC<{ y: number; quality: string; buffered: number; played?: number; stalled?: boolean }> =
  ({ y, quality, buffered, played = 0.18, stalled = false }) => {
    const frame = useCurrentFrame();
    return (
      <div style={{ position: "absolute", left: 40, top: y, width: 1000, borderRadius: 28, overflow: "hidden", background: "#05070a", border: `3px solid ${stalled ? C.red : C.border}`,
                    boxShadow: "0 30px 60px rgba(0,0,0,.55)" }}>
        <div style={{ height: 420, position: "relative", background: "linear-gradient(135deg, #1b2a44, #3a2050 55%, #4a2a20)" }}>
          {/* a few shapes, so it reads as a film still */}
          <div style={{ position: "absolute", left: 120, top: 210, width: 380, height: 210, borderRadius: "50% 50% 0 0", background: "#0d1420", opacity: 0.8 }} />
          <div style={{ position: "absolute", left: 600, top: 70, width: 120, height: 120, borderRadius: 60, background: "#f2c14e", opacity: 0.85, filter: stalled ? "blur(3px)" : "none" }} />
          <div style={{ position: "absolute", right: 24, top: 22, borderRadius: 12, padding: "8px 18px", background: "rgba(0,0,0,.6)", font: `800 34px "${FONT.mono}"`, color: quality === "270p" ? C.red : C.green }}>{quality}</div>
          {stalled && (
            <div style={{ position: "absolute", left: 460, top: 170, width: 80, height: 80, borderRadius: 40, border: `10px solid rgba(255,255,255,.2)`, borderTopColor: "#fff",
                          transform: `rotate(${frame * 18}deg)` }} />
          )}
        </div>
        <div style={{ padding: "18px 24px 22px" }}>
          <div style={{ position: "relative", height: 16, borderRadius: 8, background: "#1a212c" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: 16, borderRadius: 8, width: `${Math.min(1, played + buffered) * 100}%`, background: "#4b5566" }} />
            <div style={{ position: "absolute", left: 0, top: 0, height: 16, borderRadius: 8, width: `${played * 100}%`, background: C.red }} />
            <div style={{ position: "absolute", left: `calc(${played * 100}% - 13px)`, top: -5, width: 26, height: 26, borderRadius: 13, background: "#fff" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, font: `700 26px "${FONT.mono}"`, color: C.muted }}>
            <span>downloaded ahead: <span style={{ color: buffered < 0.03 ? C.red : C.text }}>{Math.round(buffered * 200)} s</span></span>
            <span>{stalled ? "buffering…" : "playing"}</span>
          </div>
        </div>
      </div>
    );
  };

/** The hook (and the loop's last frame). */
export const BufferTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["Ignore the speed test.", "Watch the buffer."].map((t, n) => (
      <Big key={t} size={96} color={hot === n ? (n === 1 ? C.green : C.yellow) : C.text}
           style={{ marginBottom: 12, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const stalled = at(line, "stalled");
  return (
    <>
      <BufferTitle hot={frame >= stalled ? 1 : 0} />
      <Player y={460} quality="1080p" buffered={0.22} played={0.2 + frame / 3000} />
      <Stamp text="FEWER STALLS" color={C.green} at={stalled} x={560} y={1040} rotate={-4} />
    </>
  );
};

/** The film as pieces: 4 seconds each, five qualities, one picked at a time. */
export const Pieces: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const four = at(line, "4"), five = at(line, "5"), one = at(line, "one");
  const path = [4, 3, 2, 1, 1, 0, 0, 1, 2, 2];
  const cols = 10;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={78}>The film, in pieces</Big>
      </div>
      <div style={{ position: "absolute", left: 40, top: 300, width: 1000 }}>
        {LADDER.map((q, r) => (
          <div key={q.name} style={{ display: "flex", alignItems: "center", marginBottom: 14, opacity: ramp(frame, five - 2 + r * 2, 6) }}>
            <div style={{ width: 150, font: `800 32px "${FONT.mono}"`, color: q.color }}>{q.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, flex: 1 }}>
              {Array.from({ length: cols }).map((_, c) => {
                const chosen = frame >= one + c * 3 && path[c] === r;
                return <div key={c} style={{ height: 70, borderRadius: 10, background: chosen ? q.color : "#121822", border: `3px solid ${chosen ? q.color : C.border}`,
                                             opacity: frame >= four + c ? 1 : 0.25 }} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 190, top: 760, font: `700 30px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, four, 6) }}>each square: 4 seconds of film →</div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 840, textAlign: "center", opacity: ramp(frame, one, 6), font: `800 46px "${FONT.display}"`, color: C.yellow }}>the player picks one piece at a time</div>
    </>
  );
};

/** Pick from the measured speed. */
export const Speed: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const measure = at(line, "measure"), thousand = at(line, "1,000");
  const count = Math.round(interpolate(frame, [thousand + 4, thousand + 26], [0, RESULT.speedStalls], clamp));
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}>
        <Big size={80}>Measure, then pick</Big>
      </div>
      <div style={{ position: "absolute", left: 40, top: 300, width: 1000, boxSizing: "border-box", borderRadius: 24, background: C.surface, border: `3px solid ${C.blue}`, padding: "20px 28px", opacity: ramp(frame, measure - 2, 6) }}>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>last 5 pieces came at</div>
        <div style={{ font: `800 96px "${FONT.mono}"`, letterSpacing: -4, color: C.blue }}>6.6 Mbps</div>
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>so ask for <span style={{ color: C.green }}>1080p</span> next</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 640, width: 1000, boxSizing: "border-box", opacity: ramp(frame, thousand - 2, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.red}`, padding: "16px 30px" }}>
        <div style={{ font: `800 140px/1.05 "${FONT.mono}"`, letterSpacing: -7, color: C.red }}>{count.toLocaleString("en-US")}</div>
        <div style={{ font: `800 42px "${FONT.display}"`, color: C.text }}>stalls in 1,000 bumpy connections</div>
        <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted, marginTop: 6 }}>10 minutes each · simulated networks, real pieces</div>
      </div>
    </>
  );
};

/** Why it fails: speed jumps, the choice follows, the next piece is late. */
export const Why: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const fast = at(line, "fast"), next = at(line, "next"), stops = at(line, "stops");
  const pts = [2.6, 3.4, 6.2, 6.8, 7.2, 1.1, 0.9, 2.8, 3.1, 2.2];
  const shown = interpolate(frame, [0, stops], [3, pts.length], clamp);
  const x = (i: number) => 60 + i * 100, y = (v: number) => 600 - v * 40;
  const d = pts.slice(0, Math.ceil(shown)).map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}>
        <Big size={76}>Speed jumps around</Big>
      </div>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 700 }} viewBox="0 0 1080 700">
        <line x1={50} y1={600} x2={1030} y2={600} stroke={C.border} strokeWidth={3} />
        <path d={d} fill="none" stroke={C.blue} strokeWidth={8} strokeLinejoin="round" />
        {frame >= fast && <circle cx={x(4)} cy={y(7.2)} r={18} fill={C.green} />}
        {frame >= next && <circle cx={x(5)} cy={y(1.1)} r={18} fill={C.red} />}
        {frame >= fast && <text x={x(4) - 70} y={y(7.2) - 34} fill={C.green} style={{ font: `800 34px "${FONT.mono}"` }}>picks HD</text>}
        {frame >= next && <text x={x(5) + 26} y={y(1.1) + 10} fill={C.red} style={{ font: `800 34px "${FONT.mono}"` }}>then this</text>}
      </svg>
      <div style={{ opacity: ramp(frame, stops - 4, 6) }}>
        <Player y={640} quality="1080p" buffered={0} played={0.42} stalled={frame >= stops} />
      </div>
    </>
  );
};

/** The buffer decides: low means low quality, plenty means high. */
export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const plenty = at(line, "plenty"), low = at(line, "low");
  const level = frame < plenty ? interpolate(frame, [0, plenty], [0.1, 0.5], clamp)
    : frame < low ? interpolate(frame, [plenty, low], [0.5, 0.95], clamp)
    : interpolate(frame, [low, low + 20], [0.95, 0.12], clamp);
  const q = level < 0.2 ? 4 : level < 0.4 ? 3 : level < 0.6 ? 2 : level < 0.8 ? 1 : 0;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}>
        <Big size={78}>Watch the buffer instead</Big>
      </div>
      <div style={{ position: "absolute", left: 60, top: 310, width: 300, height: 600, borderRadius: 30, border: `4px solid ${C.border}`, overflow: "hidden", background: "#121822" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${level * 100}%`, background: `linear-gradient(0deg, ${C.red}, ${C.amber} 35%, ${C.green} 75%)` }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "20%", borderTop: `3px dashed ${C.text}` }} />
        <div style={{ position: "absolute", left: 14, bottom: "21%", font: `700 24px "${FONT.mono}"`, color: C.text }}>reserve</div>
      </div>
      <div style={{ position: "absolute", left: 400, top: 310, width: 640 }}>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>seconds already downloaded</div>
        <div style={{ font: `800 110px "${FONT.mono}"`, letterSpacing: -5, color: C.text }}>{Math.round(level * 60)} s</div>
        <div style={{ marginTop: 30 }}>
          {LADDER.map((l, i) => (
            <div key={l.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 18px", marginBottom: 6, borderRadius: 14,
                                       background: i === q ? `${l.color}33` : "transparent", border: `3px solid ${i === q ? l.color : "transparent"}`,
                                       font: `800 40px "${FONT.mono}"`, color: i === q ? l.color : "#4b5566" }}>
              <span>{l.name}</span><span style={{ fontSize: 28 }}>{l.kbps}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export const Proof: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const stalls = at(line, "stalls");
  const row = (name: string, n: number, kbps: number, color: string, y: number, show: number) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", opacity: show, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, padding: "18px 28px", display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ flex: 1, font: `800 46px "${FONT.display}"`, color: C.text }}>{name}</div>
      <div style={{ textAlign: "right" }}>
        <div style={{ font: `800 84px/1 "${FONT.mono}"`, letterSpacing: -4, color }}>{n.toLocaleString("en-US")}</div>
        <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>stalls · avg {(kbps / 1000).toFixed(1)} Mbps</div>
      </div>
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, font: `700 32px "${FONT.mono}"`, color: C.muted }}>the same 1,000 connections</div>
      {row("speed-based", RESULT.speedStalls, RESULT.speedKbps, C.red, 250, ramp(frame, 0, 6))}
      {row("buffer-based", RESULT.bufferStalls, RESULT.bufferKbps, C.green, 470, ramp(frame, stalls - 2, 6))}
    </>
  );
};

/** The real case: Netflix's own A/B test, written up at SIGCOMM 2014. */
export const Netflix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const half = at(line, "half"), ten = at(line, "10");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>Netflix, 2013</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 10 }}>Huang et al., SIGCOMM 2014</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 360, width: 1000, display: "flex", gap: 24, opacity: ramp(frame, half - 2, 6) }}>
        {["A/B test 1", "A/B test 2"].map((t) => (
          <div key={t} style={{ flex: 1, borderRadius: 22, background: C.surface, border: `3px solid ${C.blue}`, padding: "18px 22px" }}>
            <div style={{ font: `700 28px "${FONT.ui}"`, color: C.muted }}>{t}</div>
            <div style={{ font: `800 46px "${FONT.display}"`, color: C.text, marginTop: 6 }}>500,000+ people</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 600, textAlign: "center", transform: `scale(${pop(frame, ten)})` }}>
        <div style={{ font: `800 170px/1 "${FONT.mono}"`, letterSpacing: -8, color: C.green }}>10-20%</div>
        <div style={{ font: `800 46px "${FONT.display}"`, color: C.text, marginTop: 10 }}>fewer rebuffers, similar quality</div>
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const speed = at(line, "speed");
    return (
      <>
        <BufferTitle hot={frame >= speed ? 1 : 0} />
        <Player y={460} quality="1080p" buffered={0.22} played={0.2} />
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The Buffer Knows · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>a real player in Go, every case tested · PDF</div>
      </div>
    </>
  );
};
