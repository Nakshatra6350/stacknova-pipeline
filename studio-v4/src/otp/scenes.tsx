// The ten scenes of Behind the Button #3, "Why your OTP dies in 30 seconds"
// (content/v4/003-otp/script.yaml). Each scene runs from its line's start until the next line starts,
// and times its beats to its line's words. The codes, steps and HMACs are real: go run . -mode=now
// -at=1793457612 and -at=1793457630, for the demo secret in the QR code (samples/go/main.go).
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import qr from "../../public/003-otp/qr.json";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { CodeLine, Editor, Stamp, Terminal, clamp, pop, ramp } from "../ui";

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

// the demo secret's two codes, from the real program
const STEP_A = { clock: "14:40:29", step: "59781920", hmac: "5bb419dd8609b7609c75fad0dd4913920685fa4c", code: "070226" };
const STEP_B = { clock: "14:40:30", step: "59781921", hmac: "ca374a8e3c7afecd6d0f7a22c778f261c45fe763", code: "844670" };
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** A countdown ring: the seconds left of this code. */
const Ring: React.FC<{ secs: number; size: number; color?: string }> = ({ secs, size, color }) => {
  const r = size / 2 - 7;
  const len = 2 * Math.PI * r;
  const shade = color ?? (secs <= 5 ? C.red : C.blue);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#263040" strokeWidth={9} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={shade} strokeWidth={9} strokeLinecap="round"
                strokeDasharray={`${len * Math.max(0, secs) / 30} ${len}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    font: `800 ${size * 0.34}px "${FONT.mono}"`, color: shade }}>{Math.ceil(Math.max(0, secs))}</div>
    </div>
  );
};

/** A phone on an authenticator app, its status bar saying airplane mode. */
export const AuthPhone: React.FC<{ code: string; secs: number; x: number; y: number; scale?: number; flash?: number }> =
  ({ code, secs, x, y, scale = 1, flash = 0 }) => (
    <div style={{ position: "absolute", left: x, top: y, width: 300, height: 540, transform: `scale(${scale})`,
                  transformOrigin: "center", borderRadius: 48, background: "#06080c", border: `4px solid #2d3644`,
                  boxShadow: "0 30px 60px rgba(0,0,0,.55)", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ alignSelf: "center", width: 90, height: 22, borderRadius: 999, background: "#000" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", font: `700 22px "${FONT.ui}"`, color: C.amber }}>
        <span>✈ Airplane</span><span style={{ color: C.muted, fontSize: 20 }}>No signal</span>
      </div>
      <div style={{ font: `800 28px "${FONT.display}"`, color: C.text, marginTop: 6 }}>Authenticator</div>
      <div style={{ borderRadius: 22, background: C.surface, border: `2px solid ${flash > 0 ? C.green : C.border}`, padding: 16,
                    boxShadow: `0 0 ${30 * flash}px ${C.green}` }}>
        <div style={{ font: `700 21px "${FONT.ui}"`, color: C.muted }}>StackNova · demo</div>
        <div style={{ font: `800 50px "${FONT.mono}"`, color: C.yellow, letterSpacing: -1, whiteSpace: "nowrap", marginTop: 6 }}>{spaced(code)}</div>
      </div>
      <div style={{ marginTop: "auto", alignSelf: "center" }}><Ring secs={secs} size={118} /></div>
    </div>
  );

/** The hook (and the loop's last frame). */
export const OtpTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["Airplane mode.", "No signal.", "Code still works."].map((t, n) => (
      <Big key={t} size={122} color={hot === n ? C.yellow : C.text}
           style={{ marginBottom: 12, transform: `scale(${hot === n ? 1.03 : 1})`, transformOrigin: "left center", whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

/** The website's login step: the code typed in, digit by digit, then you're in. */
const LoginCard: React.FC<{ code: string; x: number; y: number; typed: number; done: number; width?: number }> =
  ({ code, x, y, typed, done, width = 500 }) => (
    <div style={{ position: "absolute", left: x, top: y, width, borderRadius: 28, background: C.surface,
                  border: `3px solid ${done > 0 ? C.green : C.border}`, padding: 26, boxShadow: "0 24px 50px rgba(0,0,0,.5)" }}>
      <div style={{ font: `700 26px "${FONT.ui}"`, color: C.muted }}>Log in · step 2</div>
      <div style={{ font: `800 38px "${FONT.display}"`, color: C.text, marginTop: 4 }}>Enter your code</div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        {code.split("").map((ch, n) => (
          <div key={n} style={{ flex: 1, height: 84, borderRadius: 14, background: "#0d1117", border: `2px solid ${n < typed ? C.yellow : C.border}`,
                                display: "flex", alignItems: "center", justifyContent: "center", font: `800 44px "${FONT.mono}"`, color: C.yellow }}>
            {n < typed ? ch : ""}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, borderRadius: 16, padding: "16px 0", textAlign: "center", background: done > 0 ? C.green : C.raised,
                    font: `800 32px "${FONT.display}"`, color: done > 0 ? "#0a0d12" : C.muted }}>
        {done > 0 ? "✓ You're in" : "Verify"}
      </div>
    </div>
  );

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const signal = at(line, "no"), code = at(line, "code"), logs = at(line, "logs"), how = at(line, "how");
  const hot = frame >= code ? 2 : frame >= signal ? 1 : 0;
  const typed = Math.max(0, Math.floor((frame - code) / 3));
  return (
    <>
      <OtpTitle hot={hot} />
      <AuthPhone code={STEP_A.code} secs={21 - frame / 30} x={30} y={665} scale={0.95} flash={interpolate(frame, [code, code + 6, code + 22], [0, 1, 0], clamp)} />
      <LoginCard code={STEP_A.code} x={350} y={750} width={680} typed={typed} done={frame >= logs + 6 ? 1 : 0} />
      <div style={{ position: "absolute", left: 800, top: 1140, transform: `scale(${pop(frame, how)})`, transformOrigin: "left center",
                    font: `800 130px "${FONT.display}"`, color: C.yellow }}>How?</div>
    </>
  );
};

const ServerCard: React.FC<{ code: string; x: number; y: number; secs: number; flash?: number }> = ({ code, x, y, secs, flash = 0 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 390, height: 540, borderRadius: 34, background: C.surface,
                border: `3px solid ${flash > 0 ? C.green : C.border}`, boxShadow: `0 24px 50px rgba(0,0,0,.5), 0 0 ${36 * flash}px ${C.green}`,
                padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ fontSize: 70, lineHeight: 1 }}>⚙️</div>
    <div style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>Login server</div>
    <div style={{ font: `500 24px "${FONT.mono}"`, color: C.muted }}>expects right now:</div>
    <div style={{ font: `800 62px "${FONT.mono}"`, color: C.yellow, whiteSpace: "nowrap" }}>{spaced(code)}</div>
    <div style={{ marginTop: "auto", alignSelf: "center" }}><Ring secs={secs} size={118} /></div>
  </div>
);

/** They never talk, and every 30 seconds both land on the same 6 digits. */
export const Stakes: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const never = at(line, "never"), every = at(line, "every"), tick = at(line, "30"), same = at(line, "same");
  const code = frame >= tick ? STEP_B.code : STEP_A.code;
  // the ring runs down quickly to reach 0 on "30", then starts again
  const secs = frame < tick ? interpolate(frame, [0, every, tick], [18, 5, 0], clamp) : 30 - (frame - tick) / 30;
  const flash = interpolate(frame, [tick, tick + 5, tick + 26], [0, 1, 0], clamp) + (frame >= same ? ramp(frame, same, 8) : 0);
  const cross = pop(frame, never);
  return (
    <>
      <AuthPhone code={code} secs={secs} x={40} y={200} flash={Math.min(1, flash)} />
      <ServerCard code={code} x={650} y={200} secs={secs} flash={Math.min(1, flash)} />
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920 }}>
        <line x1={345} y1={470} x2={645} y2={470} stroke={C.red} strokeWidth={7} strokeDasharray="20 18" opacity={ramp(frame, never - 4, 8)} />
      </svg>
      <div style={{ position: "absolute", left: 405, top: 400, width: 180, textAlign: "center", transform: `scale(${cross})`,
                    font: `800 92px/1 "${FONT.display}"`, color: C.red }}>✗</div>
      <div style={{ position: "absolute", left: 345, top: 500, width: 300, textAlign: "center", transform: `scale(${cross})`,
                    font: `700 28px "${FONT.ui}"`, color: C.red }}>no connection</div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 800, textAlign: "center", transform: `scale(${pop(frame, same)})`,
                    font: `800 76px "${FONT.display}"`, color: C.green }}>= same 6 digits</div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 900, textAlign: "center", opacity: ramp(frame, same + 4, 8),
                    font: `700 34px "${FONT.ui}"`, color: C.muted }}>without a single message between them</div>
    </>
  );
};

/** The real QR code of the demo secret, drawn from its matrix. */
export const Qr: React.FC<{ x: number; y: number; size: number; style?: React.CSSProperties }> = ({ x, y, size, style }) => {
  const n = (qr as number[][]).length;
  // whole pixels per module, and the white margin a scanner needs around them
  const inner = Math.floor((size - 64) / n) * n;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: 24, background: "#fff", padding: (size - inner) / 2, ...style }}>
      <svg width={inner} height={inner} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" style={{ display: "block" }}>
        {(qr as number[][]).flatMap((row, r) => row.map((on, c) => on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0a0d12" /> : null))}
      </svg>
    </div>
  );
};

const SharedCard: React.FC<{ icon: string; title: string; x: number; y: number; secret: number; time: number; flash: number }> =
  ({ icon, title, x, y, secret, time, flash }) => (
    <div style={{ position: "absolute", left: x, top: y, width: 490, borderRadius: 28, background: C.surface,
                  border: `3px solid ${C.border}`, padding: 24, boxShadow: "0 24px 50px rgba(0,0,0,.5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, font: `800 40px "${FONT.display}"`, color: C.text }}>
        <span style={{ fontSize: 50 }}>{icon}</span>{title}
      </div>
      <div style={{ marginTop: 18, height: 76, borderRadius: 16, background: "#1d1a08", border: `3px solid ${C.yellow}`, padding: "0 18px",
                    display: "flex", alignItems: "center", opacity: secret, transform: `scale(${0.8 + 0.2 * secret})`,
                    font: `700 28px "${FONT.mono}"`, color: C.yellow, whiteSpace: "nowrap" }}>🔑 STACKNOVABEHIND…</div>
      <div style={{ marginTop: 14, height: 76, borderRadius: 16, background: "#0c1a2b", border: `3px solid ${C.blue}`, padding: "0 18px",
                    display: "flex", alignItems: "center", opacity: time, transform: `scale(${0.8 + 0.2 * time})`,
                    boxShadow: `0 0 ${28 * flash}px ${C.blue}`,
                    font: `700 34px "${FONT.mono}"`, color: C.blue, whiteSpace: "nowrap" }}>🕒 14:40:12 UTC</div>
    </div>
  );

/** The QR code holds the secret; both sides keep it; after that, only the time is shared. */
export const Secret: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const scanned = at(line, "scanned"), both = at(line, "both"), secret = at(line, "secret");
  const after = at(line, "after"), time = at(line, "time");
  // the scan line runs down the code once
  const scan = interpolate(frame, [scanned, scanned + 30], [0, 1], clamp);
  const flyL = interpolate(frame, [both, secret + 2], [0, 1], clamp);
  const key = (tx: number, ty: number) => (
    <div style={{ position: "absolute", left: interpolate(flyL, [0, 1], [500, tx]), top: interpolate(flyL, [0, 1], [400, ty]),
                  fontSize: 72, opacity: flyL > 0 && flyL < 1 ? 1 : 0 }}>🔑</div>
  );
  const flash = interpolate(frame, [time, time + 6, time + 24], [0, 1, 0], clamp);
  return (
    <>
      <Qr x={320} y={145} size={440} style={{ transform: `scale(${pop(frame, 0)})` }} />
      {frame < scanned + 30 && (
        <div style={{ position: "absolute", left: 320, width: 440, top: 145 + 440 * scan, height: 8, background: C.green,
                      boxShadow: `0 0 26px ${C.green}`, opacity: scan > 0 ? 1 : 0 }} />
      )}
      <div style={{ position: "absolute", left: 40, right: 40, top: 600, textAlign: "center", font: `500 28px "${FONT.mono}"`, color: C.muted,
                    opacity: ramp(frame, scanned + 12, 8), whiteSpace: "nowrap" }}>
        otpauth://totp/StackNova:demo?secret=<span style={{ color: C.yellow }}>STACKNOVA…</span>
      </div>
      <SharedCard icon="📱" title="Your phone" x={30} y={670} secret={ramp(frame, secret, 6)} time={ramp(frame, after, 8)} flash={flash} />
      <SharedCard icon="⚙️" title="The server" x={560} y={670} secret={ramp(frame, secret, 6)} time={ramp(frame, after, 8)} flash={flash} />
      {key(90, 760)}
      {key(860, 760)}
      <div style={{ position: "absolute", left: 40, right: 40, top: 1010, textAlign: "center", transform: `scale(${pop(frame, time)})`,
                    font: `800 56px "${FONT.display}"`, color: C.blue }}>the only two things they share</div>
    </>
  );
};

const CODE: CodeLine[] = [
  { text: "step := uint64(now.Unix() / 30)" },
  { text: "mac := hmac.New(sha1.New, secret)" },
  { text: "mac.Write(binary.BigEndian.AppendUint64(nil, step))" },
  { text: "sum := mac.Sum(nil)" },
  { text: "off := sum[len(sum)-1] & 0x0f" },
  { text: "n := binary.BigEndian.Uint32(sum[off:]) & 0x7fffffff" },
  { text: 'code := fmt.Sprintf("%06d", n%1_000_000)' },
];

const Value: React.FC<{ label: string; value: string; color: string; y: number; enter: number; big?: boolean }> =
  ({ label, value, color, y, enter, big }) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18,
                  opacity: enter, transform: `translateX(${(1 - enter) * 50}px)`, borderRadius: 20, background: C.surface,
                  border: `3px solid ${color}`, padding: "14px 22px" }}>
      <span style={{ font: `700 26px "${FONT.ui}"`, color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ font: `800 ${big ? 66 : 32}px "${FONT.mono}"`, color, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );

/** The whole algorithm, line by line, with the real values underneath. */
export const Code: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const take = at(line, "take"), divide = at(line, "divide"), mix = at(line, "mix"), cut = at(line, "cut");
  const lines = CODE.map((l, n) => {
    let hl: CodeLine["hl"];
    if (frame >= take && frame < mix && n === 0) hl = "amber";
    if (frame >= mix && frame < cut && n >= 1 && n <= 3) hl = "green";
    if (frame >= cut && n >= 4) hl = "green";
    return { ...l, hl };
  });
  return (
    <>
      <Editor file="totp.go · all of it" lines={lines} y={170} enter={ramp(frame, 0, 8)} note="simplified here · the full server is in the free guide" />
      <Value label="time ÷ 30" value={`1793457612 ÷ 30 = ${STEP_A.step}`} color={C.amber} y={685} enter={ramp(frame, divide, 7)} />
      <Value label="HMAC" value={`${STEP_A.hmac.slice(0, 26)}…`} color={C.green} y={785} enter={ramp(frame, mix, 7)} />
      <Value label="6 digits" value={spaced(STEP_A.code)} color={C.yellow} y={885} enter={ramp(frame, cut + 4, 7)} big />
    </>
  );
};

const Digits: React.FC<{ code: string; color: string; y: number; struck?: number; flipped?: number; label: string; clock: string; step: string; enter?: number }> =
  ({ code, color, y, struck = 0, flipped = 6, label, clock, step, enter = 1 }) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, opacity: enter * (1 - 0.55 * struck), transform: `translateY(${(1 - enter) * 40}px)`,
                  borderRadius: 28, background: C.surface, border: `3px solid ${struck > 0 ? C.red : color}`, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", font: `700 34px "${FONT.mono}"`, color: C.text }}>
        <span>{clock}</span><span style={{ color: C.muted, fontSize: 28 }}>step {step}</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
        {code.split("").map((ch, n) => (
          <div key={n} style={{ flex: 1, height: 140, borderRadius: 18, background: "#0d1117", border: `3px solid ${n < flipped ? color : C.border}`,
                                display: "flex", alignItems: "center", justifyContent: "center", font: `800 92px "${FONT.mono}"`, color: n < flipped ? color : "#3a4456" }}>
            {n < flipped ? ch : "•"}
          </div>
        ))}
      </div>
      <div style={{ font: `700 26px "${FONT.ui}"`, color: struck > 0 ? C.red : C.muted, marginTop: 14 }}>{label}</div>
      {struck > 0 && <div style={{ position: "absolute", left: 18, right: 18, top: 160, height: 10, background: C.red, borderRadius: 5,
                                   transform: `scaleX(${struck})`, transformOrigin: "left" }} />}
    </div>
  );

/** One second later the step changes, and every digit changes with it. */
export const Dies: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const dies = at(line, "dies"), every = at(line, "every"), digit = at(line, "digit");
  const flipped = Math.min(6, Math.floor((frame - digit + 6) / 2));
  return (
    <>
      <Digits code={STEP_A.code} color={C.yellow} y={190} clock={STEP_A.clock} step={STEP_A.step}
              label={frame >= dies ? "this code is dead" : "last second of this code"} struck={ramp(frame, dies, 8)} enter={ramp(frame, 0, 8)} />
      <Digits code={STEP_B.code} color={C.green} y={560} clock={STEP_B.clock} step={STEP_B.step}
              label="1 second later: a new step, a whole new code" flipped={Math.max(0, flipped)} enter={ramp(frame, every - 4, 8)} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 950, textAlign: "center", opacity: ramp(frame, digit + 8, 8),
                    font: `700 32px "${FONT.ui}"`, color: C.muted }}>RFC 6238 picked 30 s: long enough to type, short enough to expire</div>
    </>
  );
};

/** The bug: a right code is a right code, for anyone, as many times as it comes. */
export const Bug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const tested = at(line, "tested"), sent = at(line, "sent"), someone = at(line, "someone");
  const seen = Math.round(interpolate(frame, [at(line, "1,000", 1, -0.1), someone], [0, 1000], clamp));
  const red = Math.round(interpolate(frame, [at(line, "1,000", 2), at(line, "got")], [0, 1000], clamp));
  const bugLines: CodeLine[] = [
    { text: "if code == Code(secret, now) {", hl: "red" },
    { text: "    logIn(w, account)" },
    { text: "}" },
  ];
  return (
    <>
      <Editor file="login.go · the simple version" lines={bugLines} y={170} enter={ramp(frame, 0, 8) * (1 - ramp(frame, tested - 2, 6))} />
      <div style={{ opacity: ramp(frame, tested - 2, 8) }}>
        <div style={{ position: "absolute", left: 60, top: 190, display: "flex", alignItems: "baseline", gap: 18 }}>
          <Big size={190} color={red > 0 ? C.red : C.text}>{red > 0 ? red : seen}</Big>
          <Big size={56} color={C.muted}>/ 1,000 logins</Big>
        </div>
        <div style={{ position: "absolute", left: 66, top: 390, font: `800 54px "${FONT.display}"`, color: red > 0 ? C.red : C.muted }}>
          {red > 0 ? "someone else got in" : frame >= sent ? "same code, sent again" : "you log in with your code"}
        </div>
        <div style={{ position: "absolute", left: 66, top: 464, font: `500 26px "${FONT.mono}"`, color: C.muted }}>
          my test · Go + Postgres 16 · sent within seconds
        </div>
        <div style={{ position: "absolute", left: 60, top: 530, display: "grid", gridTemplateColumns: "repeat(40, 20px)", gap: 4 }}>
          {Array.from({ length: 1000 }).map((_, n) => (
            <div key={n} style={{ width: 20, height: 20, borderRadius: 4, background: n < red ? C.red : n < seen ? "#3a4456" : "#1a212c" }} />
          ))}
        </div>
      </div>
    </>
  );
};

const FIX: CodeLine[] = [
  { text: "step, ok := match(secret, code, time.Now(), 1)" },
  { text: "if !ok { refuse(w, \"wrong code\"); return }" },
  { text: "tag, _ := db.Exec(ctx," },
  { text: "    `UPDATE otp_accounts SET last_step = $1", sql: true },
  { text: "     WHERE account_id = $2 AND last_step < $1`,", sql: true },
  { text: "    step, account)" },
  { text: "if tag.RowsAffected() == 0 {" },
  { text: "    refuse(w, \"already used\"); return // the copy" },
  { text: "}" },
];

export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const update = at(line, "update"), saves = at(line, "saves"), zero = at(line, "0"), spent = at(line, "spent");
  const lines = FIX.map((l, n) => {
    let hl: CodeLine["hl"];
    if (frame >= update && n >= 2 && n <= 5) hl = "green";
    if (frame >= zero && n === 6) hl = "amber";
    if (frame >= spent && n === 7) hl = "red";
    return { ...l, hl };
  });
  const row = (who: string, f: number, ok: boolean, y: number) => (
    <div style={{ position: "absolute", left: 640, top: y, width: 400, transform: `scale(${pop(frame, f)})`, transformOrigin: "left center",
                  borderRadius: 20, background: ok ? "#0d1a12" : "#2a1214", border: `3px solid ${ok ? C.green : C.red}`, padding: "12px 18px" }}>
      <div style={{ font: `700 24px "${FONT.ui}"`, color: C.muted }}>{who}</div>
      <div style={{ font: `700 30px "${FONT.mono}"`, color: ok ? C.green : C.red }}>{ok ? "UPDATE 1" : "UPDATE 0"}</div>
      <div style={{ font: `700 26px "${FONT.ui}"`, color: C.text }}>{ok ? "→ you're in" : "→ refused: already spent"}</div>
    </div>
  );
  return (
    <>
      <Editor file="login.go · the fix" lines={lines} y={165} enter={ramp(frame, 0, 8)} />
      <div style={{ position: "absolute", left: 40, top: 745, width: 570, borderRadius: 24, background: C.surface,
                    border: `3px solid ${C.border}`, overflow: "hidden", opacity: ramp(frame, update, 8) }}>
        <div style={{ padding: "12px 20px", background: C.raised, font: `700 25px "${FONT.mono}"`, color: C.purple }}>otp_accounts</div>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", padding: "10px 20px 4px", font: `500 22px "${FONT.mono}"`, color: C.muted }}>
          <span>account_id</span><span>last_step</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", padding: "6px 20px 16px", font: `700 32px "${FONT.mono}"`, color: C.text,
                      background: `rgba(63,185,80,${0.25 * interpolate(frame, [saves, saves + 20], [1, 0], clamp)})` }}>
          <span>7</span><span style={{ color: frame >= saves ? C.yellow : C.muted }}>{frame >= saves ? STEP_A.step : "59781919"}</span>
        </div>
      </div>
      {row("you", saves + 4, true, 745)}
      {row("the same code again", zero, false, 905)}
    </>
  );
};

export const Proof: React.FC<SceneProps> = ({ line }) => {
  const zero = at(line, "0");
  return (
    <>
      <Terminal y={230} title="~/otp · go + postgres 16" steps={[
        { cmd: "go run . -mode=replay-naive", out: "1000 accounts, 1000 attackers got in", color: C.red, at: -30 },
        { cmd: "go run . -mode=replay-once", out: "1000 accounts, 0 attackers got in", color: C.green, at: 2 },
      ]} />
      <Stamp text="0 GOT IN" color={C.green} at={zero + 2} x={540} y={880} rotate={-6} />
    </>
  );
};

const Hop: React.FC<{ icon: string; title: string; sub: string; y: number; enter: number; color: string }> =
  ({ icon, title, sub, y, enter, color }) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, display: "flex", alignItems: "center", gap: 22, opacity: enter,
                  transform: `translateX(${(1 - enter) * 60}px)`, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, padding: "16px 24px" }}>
      <div style={{ fontSize: 66, lineHeight: 1 }}>{icon}</div>
      <div>
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text }}>{title}</div>
        <div style={{ font: `600 27px "${FONT.ui}"`, color: C.muted }}>{sub}</div>
      </div>
    </div>
  );

/** The real case: Retool's own account of 27 Aug 2023. */
export const Retool: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const year = at(line, "2023"), google = at(line, "google"), synced = at(line, "synced"), hit = at(line, "27");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 180, opacity: ramp(frame, 0, 8) }}>
        <Big size={80}>Guard the secret</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 10, opacity: ramp(frame, year, 8) }}>Retool · 27 Aug 2023</div>
      </div>
      <Hop icon="🎣" title="One employee phished" sub="by text message and a fake IT call" y={345} enter={ramp(frame, year + 6, 8)} color={C.border} />
      <Hop icon="🔓" title="Their Google account" sub="now in the attackers' hands" y={500} enter={ramp(frame, google, 8)} color={C.amber} />
      <Hop icon="☁️" title="Authenticator's cloud sync was on" sub="so the secrets, and every code, came with it" y={655} enter={ramp(frame, synced, 8)} color={C.red} />
      <div style={{ position: "absolute", left: 60, top: 820, display: "flex", alignItems: "center", gap: 26, transform: `scale(${pop(frame, hit)})`, transformOrigin: "left center" }}>
        <Big size={190} color={C.red}>27</Big>
        <div style={{ font: `800 50px/1.1 "${FONT.display}"`, color: C.text }}>cloud customers<br />with accounts taken over</div>
      </div>
      <div style={{ position: "absolute", left: 60, top: 1050, font: `500 24px "${FONT.mono}"`, color: C.muted, opacity: ramp(frame, hit + 10, 8) }}>
        retool.com/blog/mfa-isnt-mfa
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const air = at(line, "airplane"), still = at(line, "still");
    const hot = frame >= still ? 2 : frame >= air ? 0 : -1;
    return (
      <>
        <OtpTitle hot={hot} />
        <AuthPhone code={STEP_A.code} secs={21} x={390} y={665} scale={0.95} flash={frame >= still ? 1 : 0} />
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
            <Pill key={t} color={C.text} style={{ borderColor: C.border }}>{t}</Pill>
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The 30-Second Code · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>11 cases, each tested, in real Go + SQL · PDF</div>
      </div>
    </>
  );
};
