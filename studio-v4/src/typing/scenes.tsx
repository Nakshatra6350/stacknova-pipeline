// The ten scenes of Behind the Button #6, "Typing is a real message, and it's built to get lost"
// (content/v4/006-typing/script.yaml). Each scene runs from its line's start until the next line
// starts, and times its beats to its line's words. The numbers and bytes are real: node main.mjs
// compare, handshake, stuck, silent, heartbeat and slow (samples/node).
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

/** Three dots, moving as they do in every chat app. */
const Dots: React.FC<{ frame: number; size?: number; color?: string; still?: boolean }> = ({ frame, size = 22, color = C.muted, still }) => (
  <span style={{ display: "inline-flex", gap: size * 0.45, marginLeft: size * 0.6, verticalAlign: "middle" }}>
    {[0, 1, 2].map((n) => (
      <span key={n} style={{ width: size, height: size, borderRadius: size / 2, background: color,
                             transform: `translateY(${still ? 0 : Math.sin(frame / 3 - n) * size * 0.3}px)`,
                             opacity: still ? 0.6 : 0.65 + 0.35 * Math.sin(frame / 3 - n) }} />
    ))}
  </span>
);

/** The top of a chat: who it is, and whether they're typing. */
export const ChatBar: React.FC<{ y: number; typing: boolean; x?: number; width?: number; size?: number; who?: string; still?: boolean; color?: string }> =
  ({ y, typing, x = 40, width = 1000, size = 58, who = "Maya", still, color = C.green }) => {
    const frame = useCurrentFrame();
    return (
      <div style={{ position: "absolute", left: x, top: y, width, boxSizing: "border-box", borderRadius: 28, background: C.surface, border: `3px solid ${C.border}`,
                    padding: "22px 28px", display: "flex", alignItems: "center", gap: 24, boxShadow: "0 24px 50px rgba(0,0,0,.5)" }}>
        <div style={{ width: size * 1.6, height: size * 1.6, borderRadius: size, background: `linear-gradient(135deg, ${C.purple}, ${C.pink})`, flexShrink: 0 }} />
        <div>
          <div style={{ font: `800 ${size}px "${FONT.display}"`, color: C.text }}>{who}</div>
          <div style={{ font: `700 ${size * 0.62}px "${FONT.ui}"`, color: typing ? color : C.muted, marginTop: 4, whiteSpace: "nowrap" }}>
            {typing ? <>typing<Dots frame={frame} size={size * 0.24} color={color} still={still} /></> : "online"}
          </div>
        </div>
      </div>
    );
  };

/** The hook (and the loop's last frame). */
export const TypingTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {[`"typing..." is a message.`, "It's built to get lost."].map((t, n) => (
      <Big key={t} size={86} color={hot === n ? (n === 1 ? C.red : C.yellow) : C.text}
           style={{ marginBottom: 14, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

/** The signal itself, and what nothing does with it. */
export const SignalCard: React.FC<{ y: number; lost: number }> = ({ y, lost }) => (
  <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", borderRadius: 26, background: "#05070a", border: `3px solid ${lost > 0 ? C.red : C.border}`, padding: "20px 28px" }}>
    <div style={{ font: `700 54px "${FONT.mono}"`, color: C.amber, opacity: 1 - 0.55 * lost, textDecoration: lost > 0.5 ? `line-through 6px ${C.red}` : "none" }}>{`{"t":"typing"}`}</div>
    <div style={{ font: `700 36px "${FONT.ui}"`, color: lost > 0 ? C.red : C.muted, marginTop: 12, opacity: 0.4 + 0.6 * lost }}>not saved · no retry · nobody checks it arrived</div>
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const built = at(line, "built");
  return (
    <>
      <TypingTitle hot={frame >= built ? 1 : 0} />
      <ChatBar y={460} typing />
      <SignalCard y={740} lost={ramp(frame, built, 8)} />
    </>
  );
};

/** Asking every second: the signal waits for the next ask. */
export const Poll: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const half = at(line, "half"), empty = at(line, "half", 2);
  const asks = 6;
  const every = Math.max(6, Math.round((half - 2) / asks));
  const shown = Math.min(asks, Math.floor(frame / every) + 1);
  const rows = ["[]", "[]", "[]", `[{"t":"typing"}]`, "[]", "[]"];
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>Polling</Big>
        <div style={{ font: `700 34px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>"anything new?" every second</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 320, width: 1000, boxSizing: "border-box", borderRadius: 24, background: "#05070a", border: `3px solid ${C.border}`, padding: "16px 26px", height: 345 }}>
        {rows.slice(0, shown).map((r, n) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", font: `500 34px/1.5 "${FONT.mono}"`, color: r === "[]" ? C.muted : C.green }}>
            <span><span style={{ color: C.blue }}>GET</span> /poll</span><span>{r}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 40, top: 690, width: 1000, display: "flex", gap: 24 }}>
        <div style={{ flex: 1, opacity: ramp(frame, half - 2, 6), borderRadius: 24, background: C.surface, border: `3px solid ${C.red}`, padding: "16px 24px" }}>
          <div style={{ font: `800 90px "${FONT.mono}"`, letterSpacing: -4, color: C.red }}>500 ms</div>
          <div style={{ font: `700 32px "${FONT.ui}"`, color: C.text }}>late, on average</div>
        </div>
        <div style={{ flex: 1, opacity: ramp(frame, empty - 2, 6), borderRadius: 24, background: C.surface, border: `3px solid ${C.amber}`, padding: "16px 24px" }}>
          <div style={{ font: `800 90px "${FONT.mono}"`, letterSpacing: -4, color: C.amber }}>53%</div>
          <div style={{ font: `700 32px "${FONT.ui}"`, color: C.text }}>of the replies: empty</div>
        </div>
      </div>
    </>
  );
};

/** The real handshake: a web request that turns into a socket. */
export const Socket: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const web = at(line, "normal"), switches = at(line, "switches"), speak = at(line, "speak");
  const flow = (frame - speak) / 12;
  return (
    <>
      <Editor file="the real bytes" y={165} enter={ramp(frame, 0, 8)} lines={[
        { text: "GET /ws?room=7 HTTP/1.1", sql: true, hl: frame >= web && frame < switches ? "amber" : undefined },
        { text: "Upgrade: websocket", sql: true },
        { text: "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", sql: true },
        { text: "", sql: true },
        { text: "HTTP/1.1 101 Switching Protocols", hl: frame >= switches ? "green" : undefined, dim: frame < switches - 3 },
        { text: "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", dim: frame < switches - 3 },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 610, width: 1000, height: 300, opacity: ramp(frame, switches, 8) }}>
        <div style={{ position: "absolute", left: 0, top: 80, width: 230, textAlign: "center", borderRadius: 22, background: C.surface, border: `3px solid ${C.blue}`, padding: "26px 0", font: `800 44px "${FONT.display}"`, color: C.text }}>you</div>
        <div style={{ position: "absolute", right: 0, top: 80, width: 230, textAlign: "center", borderRadius: 22, background: C.surface, border: `3px solid ${C.green}`, padding: "26px 0", font: `800 44px "${FONT.display}"`, color: C.text }}>server</div>
        <div style={{ position: "absolute", left: 230, right: 230, top: 118, height: 36, borderRadius: 18, background: `${C.green}22`, border: `3px solid ${C.green}` }} />
        {frame >= speak && [0, 1, 2].map((n) => {
          const p = ((flow + n / 3) % 1);
          return <div key={n} style={{ position: "absolute", left: 770 - 540 * p - 18, top: 118, width: 36, height: 36, borderRadius: 18, background: C.green, boxShadow: `0 0 20px ${C.green}` }} />;
        })}
        <div style={{ position: "absolute", left: 0, right: 0, top: 215, textAlign: "center", opacity: ramp(frame, speak, 6), font: `800 50px "${FONT.display}"`, color: C.green }}>the server can speak first</div>
      </div>
    </>
  );
};

export const Proof: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const signal = at(line, "signal");
  const row = (name: string, ms: string, bytes: string, color: string, n: number) => (
    <div style={{ display: "flex", alignItems: "baseline", padding: "12px 26px", marginBottom: 10, borderRadius: 18, background: C.surface, border: `3px solid ${color}`, opacity: ramp(frame, n * 6, 6) }}>
      <span style={{ flex: 1, font: `800 42px "${FONT.display}"`, color: C.text }}>{name}</span>
      <span style={{ width: 280, font: `800 58px "${FONT.mono}"`, letterSpacing: -2, color, textAlign: "right" }}>{ms}</span>
      <span style={{ width: 300, font: `800 58px "${FONT.mono}"`, letterSpacing: -2, color, textAlign: "right" }}>{bytes}</span>
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 40, top: 175, width: 1000 }}>
        <div style={{ display: "flex", padding: "0 26px 10px", font: `700 28px "${FONT.mono}"`, color: C.muted }}>
          <span style={{ flex: 1 }}>one machine</span><span style={{ width: 280, textAlign: "right" }}>late</span><span style={{ width: 300, textAlign: "right" }}>bytes a signal</span>
        </div>
        {row("poll every 1 s", "~500 ms", "~950", C.red, 0)}
        {row("WebSocket", "0.5 ms", "95", C.green, 1)}
      </div>
      <div style={{ position: "absolute", left: 40, top: 500, width: 1000, boxSizing: "border-box", opacity: ramp(frame, signal - 2, 6), borderRadius: 24, background: "#05070a", border: `3px solid ${C.amber}`, padding: "22px 28px" }}>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>the whole signal, on the wire</div>
        <div style={{ font: `700 40px/1.45 "${FONT.mono}"`, marginTop: 10, wordBreak: "break-all" }}>
          <span style={{ color: C.pink }}>81 0e</span> <span style={{ color: C.amber }}>7b 22 74 22 3a 22 74 79 70 69 6e 67 22 7d</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ font: `700 34px "${FONT.mono}"`, color: C.pink }}>2-byte header</span>
          <span style={{ font: `800 58px "${FONT.mono}"`, color: C.green }}>16 bytes</span>
        </div>
      </div>
    </>
  );
};

/** A phone that dies mid-word: nothing ever says "stop". */
export const Bug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const dies = at(line, "dies"), never = at(line, "never"), tested = at(line, "tested"), forever = at(line, "forever");
  const dead = frame >= dies;
  const count = Math.round(interpolate(frame, [tested + 6, forever], [0, 1000], clamp));
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 180, width: 300, height: 480, borderRadius: 44, background: "#06080c", border: `4px solid ${dead ? C.red : "#2d3644"}`, padding: 20, boxSizing: "border-box" }}>
        <div style={{ margin: "0 auto", width: 90, height: 20, borderRadius: 999, background: "#000" }} />
        <div style={{ height: 340, marginTop: 18, borderRadius: 18, background: dead ? "#000" : C.surface, padding: 18, boxSizing: "border-box" }}>
          {!dead && <div style={{ font: `700 30px "${FONT.mono}"`, color: C.text }}>on my wa</div>}
          {dead && <div style={{ textAlign: "center", marginTop: 110, font: `800 38px "${FONT.display}"`, color: C.red }}>no battery</div>}
        </div>
      </div>
      <div style={{ position: "absolute", left: 400, top: 180, width: 640 }}>
        <ChatBar y={0} x={0} width={640} typing size={46} color={frame >= never ? C.red : C.green} />
        <div style={{ position: "absolute", left: 0, top: 190, width: 640, boxSizing: "border-box", opacity: ramp(frame, never - 2, 6), borderRadius: 22, background: "#05070a", border: `3px dashed ${C.red}`, padding: "20px 24px", font: `700 40px "${FONT.mono}"`, color: C.red, textDecoration: "line-through" }}>{`{"t":"stop"}`}</div>
        <div style={{ position: "absolute", left: 0, top: 305, font: `700 32px "${FONT.ui}"`, color: C.muted, opacity: ramp(frame, never + 4, 6) }}>never sent, so nothing tells Maya's friend</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 690, width: 1000, boxSizing: "border-box", opacity: ramp(frame, tested, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.red}`, padding: "16px 30px" }}>
        <div style={{ font: `800 130px/1.05 "${FONT.mono}"`, letterSpacing: -6, color: C.red }}>{count.toLocaleString("en-US")}</div>
        <div style={{ font: `800 42px "${FONT.display}"`, color: C.text }}>of 1,000 still say "typing"</div>
      </div>
      <Stamp text="FOREVER" color={C.red} at={forever} x={800} y={760} rotate={-6} />
    </>
  );
};

export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const timer = at(line, "timer"), no = at(line, "no"), zero = at(line, "0");
  const left = interpolate(frame, [no, zero - 2], [1, 0], clamp);
  return (
    <>
      <Editor file="the receiver" y={165} enter={ramp(frame, 0, 8)} lines={[
        { text: "heard(who) {", hl: frame >= timer && frame < no ? "green" : undefined },
        { text: "  this.until.set(who, now() + 5000);", hl: frame >= timer && frame < no ? "green" : undefined },
        { text: "}" },
      ]} />
      <ChatBar y={430} typing={left > 0} />
      <div style={{ position: "absolute", left: 40, top: 660, width: 1000 }}>
        <div style={{ height: 46, borderRadius: 23, background: "#1a212c", overflow: "hidden" }}>
          <div style={{ width: `${left * 100}%`, height: "100%", background: left > 0.25 ? C.green : C.amber }} />
        </div>
        <div style={{ font: `800 74px "${FONT.mono}"`, color: left > 0 ? C.text : C.green, marginTop: 14, textAlign: "center" }}>{(left * 5).toFixed(1)} s</div>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 870, textAlign: "center", transform: `scale(${pop(frame, zero)})` }}>
        <span style={{ font: `800 110px "${FONT.mono}"`, color: C.green }}>0</span>
        <span style={{ font: `800 50px "${FONT.display}"`, color: C.text }}> of 1,000 stuck</span>
      </div>
    </>
  );
};

/** The same timer, in two companies' own docs. */
export const Real: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const discord = at(line, "discord");
  const card = (name: string, quote: string, secs: string, y: number, show: number, color: string) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", opacity: show, transform: `translateY(${(1 - show) * 30}px)`, borderRadius: 26, background: C.surface, border: `3px solid ${color}`, padding: "22px 30px", display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: `800 58px "${FONT.display}"`, color: C.text }}>{name}</div>
        <div style={{ font: `500 32px/1.25 "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>{quote}</div>
      </div>
      <div style={{ font: `800 112px "${FONT.mono}"`, letterSpacing: -5, color, whiteSpace: "nowrap" }}>{secs}</div>
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 180, font: `700 34px "${FONT.mono}"`, color: C.muted }}>from their own developer docs</div>
      {card("Telegram", `"The status is set for 5 seconds or less"`, "5 s", 250, ramp(frame, 0, 7), C.blue)}
      {card("Discord", `the typing indicator "expires after 10 seconds"`, "10 s", 520, ramp(frame, discord - 2, 7), C.purple)}
    </>
  );
};

/** Writing to a phone that has gone: everything "works". */
export const Silent: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const sent = at(line, "100,000"), zero = at(line, "0"), ping = at(line, "ping"), no = at(line, "no"), close = at(line, "close");
  const count = Math.round(interpolate(frame, [sent, zero], [0, 100000], clamp));
  const cols = 25, rows = 6;
  return (
    <>
      <div style={{ position: "absolute", left: 40, top: 170, width: 1000, boxSizing: "border-box", opacity: ramp(frame, 0, 6), borderRadius: 24, background: "#05070a", border: `3px solid ${frame >= zero ? C.red : C.border}`, padding: "20px 28px" }}>
        <div style={{ font: `800 90px/1.05 "${FONT.mono}"`, letterSpacing: -4, color: C.text }}>{count.toLocaleString("en-US")}</div>
        <div style={{ font: `700 36px "${FONT.ui}"`, color: C.muted }}>signals written to 1,000 phones that had gone</div>
        <div style={{ font: `800 60px "${FONT.mono}"`, color: C.red, marginTop: 10, opacity: ramp(frame, zero, 6) }}>0 errors</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 520, width: 1000, opacity: ramp(frame, ping - 3, 6) }}>
        <div style={{ font: `800 50px "${FONT.display}"`, color: C.text }}>heartbeat <span style={{ font: `700 34px "${FONT.mono}"`, color: C.muted }}>ping 2 bytes · pong 6 bytes</span></div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
          {Array.from({ length: cols * rows }).map((_, n) => {
            const deadOne = (n * 7) % 3 === 0;
            const gone = deadOne && frame >= no;
            const closed = deadOne && frame >= close;
            return <div key={n} style={{ height: 34, borderRadius: 8, background: closed ? "#121822" : gone ? C.red : C.green, opacity: closed ? 0.4 : 1, boxShadow: frame >= ping && !closed && Math.floor((frame - ping) / 8) % 2 === 0 ? `0 0 10px ${gone ? C.red : C.green}` : "none" }} />;
          })}
        </div>
        <div style={{ font: `800 42px "${FONT.display}"`, color: C.green, textAlign: "center", marginTop: 18, opacity: ramp(frame, close, 6) }}>all 1,000 found, none of the healthy ones dropped</div>
      </div>
    </>
  );
};

/** One reader falls behind. Typing can go. Messages can't. */
export const Drop: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const drop = at(line, "drop"), never = at(line, "never"), built = at(line, "built");
  const naive = interpolate(frame, [0, drop], [0.1, 1], clamp);
  const after = frame >= drop;
  const fill = after ? interpolate(frame, [drop, drop + 14], [naive, 0.05], clamp) : naive;
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175 }}>
        <Big size={78}>One slow reader</Big>
        <div style={{ font: `700 32px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>10,000 signals a second, and it stops reading</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 320, width: 1000, boxSizing: "border-box", borderRadius: 24, background: C.surface, border: `3px solid ${after ? C.green : C.red}`, padding: "20px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ font: `700 34px "${FONT.ui}"`, color: C.muted }}>server's buffer for that reader</span>
          <span style={{ font: `800 62px "${FONT.mono}"`, letterSpacing: -2, color: after ? C.green : C.red }}>{after ? "70 kB" : `${Math.round(naive * 1721).toLocaleString("en-US")} kB`}</span>
        </div>
        <div style={{ marginTop: 14, height: 40, borderRadius: 20, background: "#1a212c", overflow: "hidden" }}>
          <div style={{ width: `${fill * 100}%`, height: "100%", background: after ? C.green : C.red }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 530, width: 1000, display: "flex", gap: 24 }}>
        <div style={{ flex: 1, opacity: ramp(frame, drop - 2, 6), borderRadius: 24, background: C.surface, border: `3px solid ${C.red}`, padding: "18px 24px" }}>
          <div style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>typing</div>
          <div style={{ font: `800 74px "${FONT.mono}"`, letterSpacing: -3, color: C.red, marginTop: 6 }}>26,644</div>
          <div style={{ font: `700 32px "${FONT.ui}"`, color: C.muted }}>dropped. Nobody noticed</div>
        </div>
        <div style={{ flex: 1, opacity: ramp(frame, never - 2, 6), borderRadius: 24, background: C.surface, border: `3px solid ${C.green}`, padding: "18px 24px" }}>
          <div style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>messages</div>
          <div style={{ font: `800 74px "${FONT.mono}"`, letterSpacing: -3, color: C.green, marginTop: 6 }}>311 of 311</div>
          <div style={{ font: `700 32px "${FONT.ui}"`, color: C.muted }}>arrived, in order</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 850, textAlign: "center", opacity: ramp(frame, built - 2, 6), font: `800 54px "${FONT.display}"`, color: C.yellow }}>built to get lost</div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const built = at(line, "built");
    return (
      <>
        <TypingTitle hot={frame >= built ? 1 : 0} />
        <ChatBar y={460} typing />
        <SignalCard y={740} lost={ramp(frame, built, 8)} />
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 Built to Get Lost · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>every case tested, in real Node.js · PDF</div>
      </div>
    </>
  );
};
