// The nine scenes of Behind the Button #11, "My limit was 100 a minute. 200 got through"
// (content/v4/011-rate/script.yaml). Each scene runs from its line's start until the next line
// starts, and times its beats to its line's words. The numbers come from samples/node (node main.mjs
// <mode>, three runs): a virtual clock for the limiters, a real HTTP server for the 429.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { Stamp, clamp, pop, ramp } from "../ui";

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

/** Two minutes on a line: 100 requests just before the boundary, 100 just after. */
export const Boundary: React.FC<{ y: number; before: number; after: number; okAfter?: number }> = ({ y, before, after, okAfter = 100 }) => (
  <svg style={{ position: "absolute", left: 0, top: y, width: 1080, height: 330 }} viewBox="0 0 1080 330">
    <rect x={60} y={40} width={480} height={160} rx={18} fill={C.surface} stroke={C.border} strokeWidth={3} />
    <rect x={540} y={40} width={480} height={160} rx={18} fill={C.surface} stroke={C.border} strokeWidth={3} />
    <text x={80} y={84} fill={C.muted} style={{ font: `700 28px "${FONT.mono}"` }}>minute 1</text>
    <text x={560} y={84} fill={C.muted} style={{ font: `700 28px "${FONT.mono}"` }}>minute 2</text>
    <line x1={540} y1={20} x2={540} y2={230} stroke={C.yellow} strokeWidth={5} strokeDasharray="12 8" />
    {Array.from({ length: 100 }, (_, i) => (
      <rect key={`b${i}`} x={440 + i} y={110} width={1} height={70} fill={C.green} opacity={i < before ? 1 : 0} />
    ))}
    {Array.from({ length: 100 }, (_, i) => (
      <rect key={`a${i}`} x={541 + i} y={110} width={1} height={70} fill={i < okAfter ? C.green : C.red} opacity={i < after ? 1 : 0} />
    ))}
    <text x={440} y={262} fill={C.text} style={{ font: `800 30px "${FONT.mono}"` }}>59 s</text>
    <text x={560} y={262} fill={C.text} style={{ font: `800 30px "${FONT.mono}"` }}>61 s</text>
    <text x={60} y={310} fill={C.muted} style={{ font: `700 26px "${FONT.mono}"` }}>each mark: one request · green got through</text>
  </svg>
);

/** The hook (and the loop's last frame). */
export const RateTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["Limit: 100 a minute.", "200 got through."].map((t, n) => (
      <Big key={t} size={88} color={hot === n ? (n === 1 ? C.red : C.yellow) : C.text}
           style={{ marginBottom: 12, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const sent = at(line, "200"), all = at(line, "all");
  const n = Math.round(interpolate(frame, [sent - 4, sent + 18], [0, 100], clamp));
  return (
    <>
      <RateTitle hot={frame >= all ? 1 : 0} />
      <Boundary y={470} before={n} after={n} />
      <Chip y={860} color={C.red} show={ramp(frame, all, 6)} big="200" text="of 200 let through, in 2 seconds" small="fixed window, limit 100 a minute" />
    </>
  );
};

/** Why: the counter starts again at 0 on the minute. */
export const Edge: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const zero = at(line, "0"), before = at(line, "before"), after = at(line, "after");
  const b = Math.round(interpolate(frame, [before - 4, before + 12], [0, 100], clamp));
  const a = Math.round(interpolate(frame, [after - 4, after + 12], [0, 100], clamp));
  const counter = (label: string, n: number, x: number) => (
    <div style={{ position: "absolute", left: x, top: 820, width: 480, boxSizing: "border-box", borderRadius: 24, background: C.surface,
                  border: `3px solid ${n >= 100 ? C.amber : C.border}`, padding: "14px 22px" }}>
      <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>{label}</div>
      <div style={{ font: `800 72px "${FONT.mono}"`, color: C.text }}>{n}<span style={{ color: C.muted, fontSize: 40 }}> / 100</span></div>
    </div>
  );
  return (
    <>
      <Title>It counts per minute</Title>
      <Boundary y={330} before={b} after={a} />
      {counter("minute 1 count", b, 40)}
      {counter(frame >= zero ? "minute 2 count: back to 0" : "minute 2 count", a, 560)}
    </>
  );
};

/** The token bucket: requests spend tokens, tokens drip back. */
export const Bucket: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const spend = at(line, "spends"), drip = at(line, "drip"), result = at(line, "103");
  const tokens = Math.max(0, Math.round(interpolate(frame, [spend, spend + 20], [100, 0], clamp)) + (frame > drip ? Math.floor((frame - drip) / 12) : 0));
  return (
    <>
      <Title>A token bucket</Title>
      <div style={{ position: "absolute", left: 140, top: 320, width: 360, height: 420, borderRadius: "0 0 60px 60px", border: `6px solid ${C.blue}`,
                    borderTop: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.min(100, tokens)}%`, background: `${C.blue}55` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 160, textAlign: "center", font: `800 80px "${FONT.mono}"`, color: C.text }}>{Math.min(100, tokens)}</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 260, textAlign: "center", font: `700 28px "${FONT.mono}"`, color: C.muted }}>tokens</div>
      </div>
      <div style={{ position: "absolute", left: 560, top: 360, width: 460 }}>
        <div style={{ font: `800 42px/1.3 "${FONT.display}"`, color: C.text, opacity: ramp(frame, spend, 6) }}>each request<br />spends <span style={{ color: C.amber }}>1 token</span></div>
        <div style={{ font: `800 42px/1.3 "${FONT.display}"`, color: C.text, marginTop: 40, opacity: ramp(frame, drip, 6) }}>tokens drip back:<br /><span style={{ color: C.green }}>100 a minute</span></div>
      </div>
      <Chip y={840} color={C.green} show={ramp(frame, result, 6)} big="103" text="of 200 let through in the same test" small="sliding log: 100 · fixed window: 200" />
    </>
  );
};

/** Four servers, four separate counts. */
export const Servers: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const four = at(line, "4"), thousand = at(line, "1,000"), through = at(line, "400");
  const n = Math.round(interpolate(frame, [thousand, thousand + 24], [0, 100], clamp));
  return (
    <>
      <Title>4 servers, 4 counts</Title>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ position: "absolute", left: 40 + (i % 2) * 520, top: 320 + Math.floor(i / 2) * 230, width: 480, boxSizing: "border-box",
                              borderRadius: 24, background: C.surface, border: `3px solid ${n >= 100 ? C.amber : C.border}`, padding: "16px 22px",
                              opacity: ramp(frame, four + i * 3, 6) }}>
          <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>server {i + 1} · counts alone</div>
          <div style={{ font: `800 76px "${FONT.mono}"`, color: C.text }}>{n}<span style={{ color: C.muted, fontSize: 40 }}> / 100</span></div>
        </div>
      ))}
      <Chip y={840} color={C.red} show={ramp(frame, through, 6)} big="400" text="of 1,000 let through" small="limit 100 a minute · one shared count: 100" />
    </>
  );
};

/** One shared count: read-then-write against one atomic increment. */
export const Race: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const read = at(line, "read"), fifty = at(line, "50"), atomic = at(line, "atomic");
  const row = (title: string, code: string, through: number, color: string, y: number, show: number) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", borderRadius: 24, background: C.surface,
                  border: `3px solid ${color}`, padding: "16px 24px", opacity: show }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>{title}</div>
        <div style={{ font: `800 64px "${FONT.mono}"`, color }}>{through}<span style={{ fontSize: 30, color: C.muted }}> got in</span></div>
      </div>
      <div style={{ font: `700 28px "${FONT.mono}"`, color: C.amber, marginTop: 6 }}>{code}</div>
    </div>
  );
  return (
    <>
      <Title>99 of 100 used. 50 arrive.</Title>
      <div style={{ position: "absolute", left: 60, top: 270, font: `700 26px "${FONT.mono}"`, color: C.muted }}>a shared store 1 ms away (simulated) · 100 trials each</div>
      {row("read, check, write", "n = get(key); if n < 100: set(key, n + 1)", frame >= fifty ? 50 : 0, C.red, 340, ramp(frame, read, 6))}
      {row("one atomic increment", "if incr(key) <= 100: allow", 1, C.green, 560, ramp(frame, atomic, 6))}
      <div style={{ position: "absolute", left: 60, top: 790, width: 960, font: `800 40px/1.3 "${FONT.display}"`, color: C.text, opacity: ramp(frame, fifty, 6) }}>
        all 50 read <span style={{ color: C.amber }}>99</span> before anyone wrote <span style={{ color: C.amber }}>100</span>
      </div>
    </>
  );
};

/** One limit for everybody against one per account. */
export const Accounts: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const each = at(line, "each"), everybody = at(line, "everybody"), pct = at(line, "44%");
  const bar = (title: string, value: number, color: string, y: number, show: number, label: string) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, opacity: show }}>
      <div style={{ display: "flex", justifyContent: "space-between", font: `800 40px "${FONT.display}"`, color: C.text }}>
        <span>{title}</span><span style={{ font: `800 44px "${FONT.mono}"`, color }}>{label}</span>
      </div>
      <div style={{ marginTop: 12, height: 44, borderRadius: 22, background: "#1a212c", overflow: "hidden" }}>
        <div style={{ height: 44, width: `${value}%`, background: color }} />
      </div>
    </div>
  );
  const grow = interpolate(frame, [pct - 6, pct + 10], [0, 44.4], clamp);
  return (
    <>
      <Title>Limit each account</Title>
      <div style={{ position: "absolute", left: 60, top: 270, font: `700 26px "${FONT.mono}"`, color: C.muted }}>100 quiet accounts, 1 loud one · quiet requests refused</div>
      {bar("one limit for everybody", grow, C.red, 360, ramp(frame, everybody, 6), `${grow.toFixed(1)}%`)}
      {bar("100 a minute per account", 0, C.green, 560, ramp(frame, each, 6), "0%")}
      <div style={{ position: "absolute", left: 60, top: 760, width: 960, font: `800 40px/1.3 "${FONT.display}"`, color: C.text, opacity: ramp(frame, pct + 6, 6) }}>
        the loud account used up everyone's limit
      </div>
    </>
  );
};

/** The answer: a real 429 from the test server. */
export const Answer: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const code = at(line, "429"), back = at(line, "come");
  const lines: [string, string, number][] = [
    ["GET /v1/orders · request 101 · key acme", C.muted, 0],
    ["HTTP/1.1 429 Too Many Requests", C.red, code],
    ["retry-after: 1", C.green, back],
    ["x-ratelimit-remaining: 0", C.text, back + 4],
    ['{"error":"too many requests","retry_after":1}', C.amber, back + 8],
  ];
  return (
    <>
      <Title>Say no, and say when</Title>
      <div style={{ position: "absolute", left: 40, top: 320, width: 1000, boxSizing: "border-box", borderRadius: 26, background: "#0d1117",
                    border: `3px solid ${C.border}`, padding: "26px 28px" }}>
        {lines.map(([t, color, when]) => (
          <div key={t} style={{ font: `700 30px/1.6 "${FONT.mono}"`, color, opacity: ramp(frame, when, 5) }}>{t}</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 60, top: 700, font: `700 28px/1.5 "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, back, 6) }}>
        a real Node server · requests 1 to 100: 200 OK<br />another account at the same time: all 200 OK
      </div>
      <Stamp text="429" color={C.red} at={code + 2} x={780} y={860} rotate={-6} />
    </>
  );
};

/** The real case: Stripe's and GitHub's own docs. */
export const Real: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const stripe = at(line, "stripe"), github = at(line, "github");
  const card = (name: string, color: string, body: string, src: string, y: number, show: number) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", borderRadius: 26, background: C.surface,
                  border: `3px solid ${color}`, padding: "22px 28px", opacity: show, transform: `translateY(${(1 - show) * 30}px)` }}>
      <div style={{ font: `800 56px "${FONT.display}"`, color }}>{name}</div>
      <div style={{ font: `800 40px/1.25 "${FONT.display}"`, color: C.text, marginTop: 8 }}>{body}</div>
      <div style={{ font: `700 24px "${FONT.mono}"`, color: C.muted, marginTop: 10 }}>{src}</div>
    </div>
  );
  return (
    <>
      <Title>The real ones</Title>
      {card("Stripe", C.purple, "a token bucket, on Redis", "Paul Tarjan, Stripe engineering blog, 30 March 2017", 300, ramp(frame, stripe, 6))}
      {card("GitHub", C.text, "5,000 requests an hour per user · x-ratelimit-remaining, reset", "GitHub REST API docs", 600, ramp(frame, github, 6))}
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const through = at(line, "through"); // the Short says "two hundred", not "200"
    return (
      <>
        <RateTitle hot={frame >= through ? 1 : 0} />
        <Boundary y={470} before={100} after={100} />
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The 101st Request · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>real Node, every case tested · PDF</div>
      </div>
    </>
  );
};
