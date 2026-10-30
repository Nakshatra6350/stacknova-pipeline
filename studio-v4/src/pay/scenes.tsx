// The nine scenes of Behind the Button #2, "You tapped Pay twice" (content/v4/002-pay/script.yaml).
// Each scene runs from its line's start until the next line starts, and times its beats to its
// line's words.
import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { Arrow, CodeLine, Editor, Stamp, Terminal, clamp, pop, ramp } from "../ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

const Pill: React.FC<{ children: React.ReactNode; color: string; style?: React.CSSProperties }> = ({ children, color, style }) => (
  <div style={{ font: `700 30px "${FONT.ui}"`, color, border: `3px solid ${color}`, borderRadius: 999, padding: "12px 24px",
                background: C.surface, whiteSpace: "nowrap", ...style }}>{children}</div>
);

// the key the app makes for this checkout: crypto/rand.Text(), 26 base32 characters
export const KEY = "KX7Q2M4ZJ9TB3WVN6R8PD5HCAY";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const Spinner: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <div style={{ width: 34, height: 34, borderRadius: 17, border: `5px solid #3a4456`, borderTopColor: C.text,
                    transform: `rotate(${frame * 20}deg)` }} />
      <span>Paying…</span>
    </div>
  );
};

type PayState = "idle" | "spinning" | "paid";
/** A phone on the checkout screen: headphones, $49.99 and the Pay button. Each frame in `charged`
 * slides in one bank notification: the money the card network took. */
export const CheckoutPhone: React.FC<{ state: PayState; x: number; y: number; scale?: number; tap?: number; charged?: number[] }> =
  ({ state, x, y, scale = 1, tap = 0, charged = [] }) => {
    const frame = useCurrentFrame();
    const button = { idle: [C.blue, "Pay $49.99"], spinning: [C.raised, ""], paid: [C.green, "Paid ✓"] }[state];
    return (
      <div style={{ position: "absolute", left: x, top: y, width: 300, height: 540, transform: `scale(${scale})`,
                    transformOrigin: "center", borderRadius: 48, background: "#06080c", border: `4px solid #2d3644`,
                    boxShadow: "0 30px 60px rgba(0,0,0,.55)", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ alignSelf: "center", width: 90, height: 22, borderRadius: 999, background: "#000" }} />
        <div style={{ font: `700 26px "${FONT.ui}"`, color: C.muted }}>Checkout</div>
        <div style={{ borderRadius: 22, background: C.surface, border: `2px solid ${C.border}`, padding: 18 }}>
          <div style={{ fontSize: 62, lineHeight: 1 }}>🎧</div>
          <div style={{ font: `700 26px "${FONT.ui}"`, color: C.text, marginTop: 10 }}>Headphones</div>
          <div style={{ font: `800 46px "${FONT.display}"`, color: C.text }}>$49.99</div>
        </div>
        <div style={{ marginTop: "auto", borderRadius: 22, padding: "22px 0", textAlign: "center",
                      transform: `scale(${1 - 0.08 * tap})`, background: button[0],
                      font: `800 30px "${FONT.display}"`, color: state === "spinning" ? C.muted : "#0a0d12" }}>
          {state === "spinning" ? <Spinner /> : button[1]}
        </div>
        {charged.map((f, n) => {
          const p = pop(frame, f);
          if (p <= 0.001) return null;
          return (
            <div key={n} style={{ position: "absolute", left: 14, right: 14, top: 58 + n * 74, transform: `translateY(${(1 - p) * -40}px)`,
                                  opacity: Math.min(1, p * 1.4), borderRadius: 18, padding: "10px 14px",
                                  background: n > 0 ? "#2a1214" : "#1b2333", border: `2px solid ${n > 0 ? C.red : C.border}`,
                                  font: `700 21px/1.25 "${FONT.ui}"`, color: C.text, boxShadow: "0 10px 24px rgba(0,0,0,.6)" }}>
              💳 Card charged<br />
              <span style={{ font: `800 26px "${FONT.display}"`, color: n > 0 ? C.red : C.text }}>−$49.99</span>
            </div>
          );
        })}
      </div>
    );
  };

/** The hook (and the loop's last frame): you tap Pay, it spins, you tap again. */
export const PayTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["You tap Pay.", "It spins.", "You tap again."].map((t, n) => (
      <Big key={t} size={128} color={hot === n ? C.yellow : C.text}
           style={{ marginBottom: 12, transform: `scale(${hot === n ? 1.04 : 1})`, transformOrigin: "left center" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const tap1 = at(line, "tap"), spins = at(line, "spins"), tap2 = at(line, "tap", 2), charged = at(line, "charged");
  const hot = frame >= tap2 ? 2 : frame >= spins ? 1 : 0;
  const press = (f: number) => interpolate(frame, [f, f + 3, f + 8], [0, 1, 0], clamp);
  const taps = frame >= tap2 ? 2 : frame >= tap1 ? 1 : 0;
  return (
    <>
      <PayTitle hot={hot} />
      <CheckoutPhone state={frame >= tap1 + 4 ? "spinning" : "idle"} x={390} y={690} scale={0.95}
                     tap={press(tap1) + press(tap2)} />
      <div style={{ position: "absolute", left: 70, top: 900, width: 260, textAlign: "center", opacity: taps ? 1 : 0 }}>
        <div style={{ fontSize: 110, lineHeight: 1 }}>👆</div>
        <div style={{ font: `800 64px "${FONT.display}"`, color: taps === 2 ? C.amber : C.text,
                      transform: `scale(${0.8 + 0.2 * pop(frame, taps === 2 ? tap2 : tap1)})` }}>tap ×{taps}</div>
      </div>
      <div style={{ position: "absolute", left: 735, top: 860, transform: `scale(${pop(frame, charged)})`, transformOrigin: "left center",
                    font: `800 150px "${FONT.display}"`, color: C.yellow }}>×2?</div>
    </>
  );
};

/** "Yes": two charges on one phone, then the test: 1,000 lost replies, 1,000 shoppers charged twice. */
export const Stakes: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const test = at(line, "tested");
  const seen = Math.round(interpolate(frame, [at(line, "1,000", 1, -0.2), at(line, "lost")], [0, 1000], clamp));
  const red = Math.round(interpolate(frame, [at(line, "all"), at(line, "twice")], [0, 1000], clamp));
  const both = ramp(frame, 0, 6) * (1 - ramp(frame, test - 6, 8));
  return (
    <>
      {frame < test + 4 && (
        <div style={{ opacity: both }}>
          <CheckoutPhone state="paid" x={150} y={300} charged={[4, at(line, "yes")]} />
          <div style={{ position: "absolute", left: 560, top: 420 }}>
            <Big size={190} color={C.red}>×2</Big>
            <div style={{ font: `800 50px "${FONT.display}"`, color: C.text, marginTop: 12 }}>−$99.98</div>
            <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>for one pair of headphones</div>
          </div>
        </div>
      )}
      {frame >= test - 2 && (
        <div style={{ opacity: ramp(frame, test - 2, 8) }}>
          <div style={{ position: "absolute", left: 60, top: 200, display: "flex", alignItems: "baseline", gap: 18 }}>
            <Big size={190} color={red > 0 ? C.red : C.text}>{red > 0 ? red : seen}</Big>
            <Big size={56} color={C.muted}>/ 1,000 checkouts</Big>
          </div>
          <div style={{ position: "absolute", left: 66, top: 400, font: `800 54px "${FONT.display}"`,
                        color: red > 0 ? C.text : C.muted }}>
            {red > 0 ? "charged twice" : "reply lost, app retried"}
          </div>
          <div style={{ position: "absolute", left: 66, top: 474, font: `500 26px "${FONT.mono}"`, color: C.muted }}>
            my test · Go + Postgres 16 · every first reply dropped
          </div>
          <div style={{ position: "absolute", left: 60, top: 550, display: "grid", gridTemplateColumns: "repeat(40, 20px)", gap: 4 }}>
            {Array.from({ length: 1000 }).map((_, n) => (
              <div key={n} style={{ width: 20, height: 20, borderRadius: 4,
                                    background: n < red ? C.red : n < seen ? "#3a4456" : "#1a212c" }} />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

const Node: React.FC<{ x: number; y: number; icon: string; title: string; sub: string; color: string; glow?: number }> =
  ({ x, y, icon, title, sub, color, glow = 0 }) => (
    <div style={{ position: "absolute", left: x, top: y, width: 240, height: 190, borderRadius: 26, background: C.surface,
                  border: `3px solid ${glow > 0 ? color : C.border}`, boxShadow: `0 0 ${36 * glow}px ${color}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <div style={{ fontSize: 64, lineHeight: 1 }}>{icon}</div>
      <div style={{ font: `800 32px "${FONT.display}"`, color: C.text }}>{title}</div>
      <div style={{ font: `500 22px "${FONT.mono}"`, color: C.muted }}>{sub}</div>
    </div>
  );

/** Why: the first payment worked, its reply was lost, the app sent it again, the server charged again. */
export const Lost: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const first = at(line, "first"), card = at(line, "card"), charged1 = at(line, "charged");
  const reply = at(line, "reply"), lost = at(line, "lost"), again = at(line, "again"), charged2 = at(line, "charged", 2);
  const draw = (start: number, end = 1) => interpolate(frame, [start, start + 10], [0, end], clamp);
  const fade = 1 - 0.65 * ramp(frame, at(line, "so"), 8); // the first round dims before the retry
  const glow = (f: number) => interpolate(frame, [f, f + 4, f + 20], [0, 1, 0], clamp);
  const rows: [string, number, boolean][] = [["first tap", charged1, false], ["retry", charged2, true]];
  return (
    <>
      <CheckoutPhone state={frame >= first ? "spinning" : "idle"} x={-25} y={160} scale={0.7} />
      <Node x={420} y={325} icon="⚙️" title="server" sub="POST /pay" color={C.blue} glow={glow(first + 8) + glow(again + 8)} />
      <Node x={820} y={325} icon="💳" title="card" sub="network" color={C.amber} glow={glow(charged1) + glow(charged2)} />
      <div style={{ opacity: fade }}>
        <Arrow a={[240, 370]} b={[410, 370]} progress={draw(first)} color={C.blue} label="pay" />
        <Arrow a={[665, 370]} b={[810, 370]} progress={draw(card)} color={C.amber} label="charge" />
        <Arrow a={[410, 470]} b={[240, 470]} progress={draw(reply, 0.7)} color={C.green} label="Paid ✓" />
      </div>
      <div style={{ position: "absolute", left: 255, top: 505, transform: `scale(${pop(frame, lost)})`,
                    font: `800 46px "${FONT.display}"`, color: C.red, background: "rgba(10,13,18,.9)",
                    border: `4px solid ${C.red}`, borderRadius: 16, padding: "2px 16px" }}>✗ lost</div>
      <Arrow a={[240, 370]} b={[410, 370]} progress={draw(again)} color={C.blue} label="pay again" />
      <Arrow a={[665, 370]} b={[810, 370]} progress={draw(charged2 - 6)} color={C.red} label="charge" />
      <div style={{ position: "absolute", left: 60, top: 640, width: 960, borderRadius: 26, background: C.surface,
                    border: `3px solid ${C.border}`, overflow: "hidden", opacity: ramp(frame, 0, 8) }}>
        <div style={{ padding: "16px 24px", background: C.raised, font: `700 26px "${FONT.mono}"`, color: C.purple,
                      display: "flex", justifyContent: "space-between" }}>
          <span>card statement</span><span style={{ color: C.muted }}>•• 1234</span>
        </div>
        {rows.map(([who, f, bad]) => (
          <div key={who} style={{ display: "flex", justifyContent: "space-between", padding: "18px 24px",
                                  borderTop: `2px solid ${C.border}`, opacity: ramp(frame, f, 6),
                                  background: bad ? `rgba(255,90,82,${0.18 * ramp(frame, f, 6)})` : "transparent",
                                  font: `700 34px "${FONT.mono}"`, color: C.text }}>
            <span>Headphones <span style={{ color: C.muted, fontSize: 26 }}>· {who}</span></span>
            <span style={{ color: bad ? C.red : C.text }}>−$49.99</span>
          </div>
        ))}
      </div>
      <Stamp text="CHARGED TWICE" color={C.red} at={charged2 + 8} x={540} y={1000} rotate={-5} />
    </>
  );
};

const BUG: CodeLine[] = [
  { text: "func pay(w http.ResponseWriter, r *http.Request) {" },
  { text: "    account, p := read(r)" },
  { text: "    id := card.Charge(account, p.AmountCents)" },
  { text: "    reply(w, Receipt{id, account, p.AmountCents})" },
  { text: "}" },
];

const Request: React.FC<{ title: string; x: number; y: number; width: number; lines: [string, string?][]; color?: string; enter?: number }> =
  ({ title, x, y, width, lines, color = C.border, enter = 1 }) => (
    <div style={{ position: "absolute", left: x, top: y, width, borderRadius: 22, background: "#0d1117", border: `3px solid ${color}`,
                  opacity: enter, transform: `translateY(${(1 - enter) * 40}px)`, overflow: "hidden", boxShadow: "0 24px 50px rgba(0,0,0,.5)" }}>
      <div style={{ padding: "10px 20px", background: C.raised, font: `700 24px "${FONT.mono}"`, color: C.muted }}>{title}</div>
      <div style={{ padding: "12px 20px 16px", font: `500 27px/1.5 "${FONT.mono}"`, whiteSpace: "pre" }}>
        {lines.map(([text, hl], n) => (
          <div key={n} style={{ color: hl ?? C.text, background: hl ? `${hl}22` : "transparent", borderRadius: 8 }}>{text}</div>
        ))}
      </div>
    </div>
  );

const BODY: [string, string?][] = [["POST /pay", C.blue], ['{"item": "headphones",'], [' "amount_cents": 4999}']];

export const CodeBug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const charges = at(line, "charges"), tell = at(line, "tell"), retry = at(line, "retry"), payment = at(line, "payment");
  const lines = BUG.map((l, n) => ({ ...l, hl: (frame >= charges && n === 2 ? "red" : undefined) as CodeLine["hl"] }));
  return (
    <>
      <Editor file="pay.go · the usual version" lines={lines} y={210} enter={ramp(frame, 0, 8)}
              note="simplified here · full server in the free guide" />
      <Request title="tap" x={40} y={640} width={470} lines={BODY} enter={ramp(frame, tell - 4, 8)} />
      <Request title="retry" x={570} y={640} width={470} lines={BODY} enter={ramp(frame, retry - 2, 8)} />
      <div style={{ position: "absolute", left: 495, top: 700, transform: `scale(${pop(frame, retry + 4)})`,
                    font: `800 90px "${FONT.display}"`, color: C.amber }}>=</div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 900, textAlign: "center", transform: `scale(${pop(frame, payment)})`,
                    font: `800 52px "${FONT.display}"`, color: C.amber }}>same bytes · which one is new?</div>
    </>
  );
};

/** The fix: one random key per checkout, sent with every attempt. */
export const Key: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const key = at(line, "idempotency"), random_ = at(line, "random"), id = at(line, "id", 2); // "ID", after "idempotency"
  const each = at(line, "each"), sends = at(line, "sends"), every = at(line, "every");
  // the key scrambles while "one random ID" is said, then settles
  const shown = frame >= id + 4 ? KEY : KEY.split("").map((_, n) => BASE32[Math.floor(random(`k${n}-${Math.floor(frame / 2)}`) * 32)]).join("");
  const header = (hot: boolean): [string, string?][] => [
    ["POST /pay", C.blue], [`Idempotency-Key: ${KEY}`, hot ? C.yellow : C.text], ['{"item":"headphones","amount_cents":4999}'],
  ];
  return (
    <>
      <Big size={96} style={{ position: "absolute", left: 60, top: 200, opacity: ramp(frame, 0, 8) }}>The fix:</Big>
      <div style={{ position: "absolute", left: 40, top: 320, width: 1000, transform: `scale(${pop(frame, key)})`, transformOrigin: "left center",
                    borderRadius: 24, background: "#1d1a08", border: `4px solid ${C.yellow}`, padding: "16px 24px" }}>
        <div style={{ font: `700 28px "${FONT.mono}"`, color: C.muted }}>🔑 Idempotency-Key</div>
        <div style={{ font: `700 50px "${FONT.mono}"`, color: C.yellow, letterSpacing: 1 }}>{frame >= random_ ? shown : KEY}</div>
      </div>
      <Pill color={C.green} style={{ position: "absolute", left: 40, top: 500, opacity: ramp(frame, each, 8) }}>
        made once, when the checkout opens
      </Pill>
      <Request title="attempt 1" x={40} y={600} width={1000} lines={header(frame >= every)} enter={ramp(frame, sends - 2, 8)} />
      <Request title="attempt 2 · retry" x={40} y={830} width={1000} lines={header(frame >= every)} color={frame >= every ? C.yellow : C.border}
               enter={ramp(frame, every - 2, 8)} />
    </>
  );
};

const FIX: CodeLine[] = [
  { text: 'key := r.Header.Get("Idempotency-Key")' },
  { text: "tag, _ := db.Exec(ctx," },
  { text: "    `INSERT INTO idempotency_keys (account_id, key)", sql: true },
  { text: "     VALUES ($1, $2) ON CONFLICT DO NOTHING`,", sql: true },
  { text: "    account, key)" },
  { text: "if tag.RowsAffected() == 0 {" },
  { text: "    return firstReceipt(w, account, key) // a retry" },
  { text: "}" },
  { text: "id := card.Charge(account, p.AmountCents)" },
];

export const CodeFix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const inserts = at(line, "inserts"), before = at(line, "before"), unique = at(line, "unique");
  const one = at(line, "one"), win = at(line, "win"), zero = at(line, "0"), skip = at(line, "skip"), back = at(line, "back");
  const lines = FIX.map((l, n) => {
    let hl: CodeLine["hl"];
    if (frame >= inserts && n >= 1 && n <= 4) hl = "green";
    if (frame >= before && frame < unique && n === 8) hl = "amber";
    if (frame >= zero && n === 5) hl = "amber";
    if (frame >= back && n === 6) hl = "green";
    return { ...l, hl, dim: frame >= skip && n === 8, strike: frame >= skip && n === 8 };
  });
  const row = (who: string, f: number, ok: boolean, y: number) => (
    <div style={{ position: "absolute", left: 640, top: y, width: 400, transform: `scale(${pop(frame, f)})`, transformOrigin: "left center",
                  borderRadius: 20, background: ok ? "#0d1a12" : "#2a1214", border: `3px solid ${ok ? C.green : C.red}`, padding: "12px 18px" }}>
      <div style={{ font: `700 24px "${FONT.ui}"`, color: C.muted }}>{who}</div>
      <div style={{ font: `700 30px "${FONT.mono}"`, color: ok ? C.green : C.red }}>{ok ? "INSERT 0 1" : "INSERT 0 0"}</div>
      <div style={{ font: `700 26px "${FONT.ui}"`, color: C.text }}>{ok ? "→ charge $49.99" : frame >= back ? "→ first receipt ↩" : "→ skip the charge"}</div>
    </div>
  );
  return (
    <>
      <Editor file="pay.go · the fix" lines={lines} y={180} enter={ramp(frame, 0, 8)} />
      <div style={{ position: "absolute", left: 40, top: 760, width: 570, borderRadius: 24, background: C.surface,
                    border: `3px solid ${C.border}`, overflow: "hidden", opacity: ramp(frame, inserts, 8) }}>
        <div style={{ padding: "12px 20px", background: C.raised, font: `700 25px "${FONT.mono}"`, color: C.purple }}>idempotency_keys</div>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", padding: "10px 20px 4px", font: `500 22px "${FONT.mono}"`, color: C.muted }}>
          <span>account_id</span><span>key</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", padding: "6px 20px 12px", font: `700 27px "${FONT.mono}"`, color: C.text,
                      background: `rgba(63,185,80,${0.25 * interpolate(frame, [inserts + 4, inserts + 20], [1, 0], clamp)})` }}>
          <span>shopper7</span><span style={{ color: C.yellow }}>{KEY.slice(0, 10)}…</span>
        </div>
        <div style={{ padding: "10px 20px 16px", font: `700 25px "${FONT.mono}"`, color: frame >= unique ? C.amber : C.muted,
                      borderTop: `2px solid ${C.border}`, transform: `scale(${frame >= unique ? 1 + 0.06 * pop(frame, unique) - 0.06 * ramp(frame, unique + 10, 10) : 1})`,
                      transformOrigin: "left center" }}>
          🔒 PRIMARY KEY (account_id, key)
        </div>
      </div>
      {row("tap", one, true, 750)}
      {row("retry, same key", win, false, 910)}
    </>
  );
};

export const Proof: React.FC<SceneProps> = ({ line }) => {
  const withKey = at(line, "with"), zero = at(line, "0");
  return (
    <>
      <Terminal y={260} title="~/pay · go + postgres 16" steps={[
        { cmd: "go run . -mode=lost-reply-no-key", out: "lost-reply-no-key: 1000 shoppers, 2000 charges, 1000 charged twice", color: C.red, at: 0 },
        { cmd: "go run . -mode=lost-reply-key", out: "lost-reply-key: 1000 shoppers, 1000 charges, 0 charged twice", color: C.green, at: withKey - 12 },
      ]} />
      <Stamp text="0 CHARGED TWICE" color={C.green} at={zero + 4} x={540} y={930} rotate={-6} />
    </>
  );
};

/** Stripe: every POST takes an Idempotency-Key; a retry with the same key gets the saved first response. */
export const Stripe: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const retry = at(line, "retry"), key = at(line, "idempotency"), first = at(line, "first"), not = at(line, "not");
  const req: [string, string?][] = [
    ["POST /v1/payment_intents", C.blue], ["Idempotency-Key: 9TQ4M2KX7ZJ3HB8W", frame >= key ? C.yellow : C.text],
    ["amount=4999&currency=usd"], ["&payment_method=pm_card_visa&confirm=true"],
  ];
  const reply = (who: string, f: number, saved: boolean, y: number) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, display: "flex", alignItems: "center", gap: 18,
                  opacity: ramp(frame, f, 8), transform: `translateX(${(1 - ramp(frame, f, 8)) * 40}px)`,
                  borderRadius: 20, background: C.surface, border: `3px solid ${saved ? C.green : C.border}`, padding: "14px 20px" }}>
      <span style={{ width: 220, font: `700 26px "${FONT.ui}"`, color: C.muted, whiteSpace: "nowrap" }}>{who}</span>
      <span style={{ font: `700 30px "${FONT.mono}"`, color: C.green }}>200</span>
      <span style={{ font: `700 30px "${FONT.mono}"`, color: C.text }}>pi_3Qd8xR2eZvKj</span>
      {saved && <span style={{ marginLeft: "auto", font: `700 26px "${FONT.ui}"`, color: C.green }}>the saved first response</span>}
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 190, opacity: ramp(frame, 0, 8) }}>
        <Big size={110}>Stripe</Big>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted, marginTop: 8 }}>every POST accepts an Idempotency-Key</div>
      </div>
      <Request title="your server → Stripe · test mode" x={40} y={400} width={1000} lines={req} color={frame >= key ? C.yellow : C.border}
               enter={ramp(frame, retry - 8, 8)} />
      {reply("attempt 1", retry, false, 700)}
      {reply("retry, same key", first, true, 800)}
      <Pill color={C.green} style={{ position: "absolute", left: 40, top: 920, transform: `scale(${pop(frame, not)})`, transformOrigin: "left center",
                                     font: `800 40px "${FONT.display}"` }}>1 charge, not 2</Pill>
      <div style={{ position: "absolute", left: 60, top: 1035, font: `500 22px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, first, 8) }}>
        docs.stripe.com/api/idempotent_requests · ids are examples
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const spin = at(line, "it'll"), tap = at(line, "tap");
    const hot = frame >= tap ? 2 : frame >= spin ? 1 : -1;
    return (
      <>
        <PayTitle hot={hot} />
        <CheckoutPhone state={frame >= spin ? "spinning" : "idle"} x={390} y={690} scale={0.95}
                       tap={interpolate(frame, [tap, tap + 3, tap + 8], [0, 1, 0], clamp)} />
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
            <div key={t} style={{ font: `700 30px "${FONT.ui}"`, color: C.text, border: `3px solid ${C.border}`,
                                  background: C.surface, borderRadius: 999, padding: "12px 22px" }}>{t}</div>
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The Double Charge · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>9 cases, each tested, in real Go + SQL · PDF</div>
      </div>
    </>
  );
};
