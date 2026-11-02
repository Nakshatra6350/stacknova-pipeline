// The nine scenes of Behind the Button #7, "Every password was hashed, and every account was still
// stolen" (content/v4/007-reset/script.yaml). Each scene runs from its line's start until the next
// line starts, and times its beats to its line's words. The numbers are real: reset.exe -mode=leak,
// hashes, once and scanner (samples/go), on PostgreSQL 16.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { Line, frames, wordAt } from "../timeline";
import { Editor, clamp, pop, ramp } from "../ui";

type SceneProps = { line: Line };
const at = (line: Line, word: string, nth = 1, shift = 0) => frames(wordAt(line, word, nth) + shift);

// from the runs (see content/v4/007-reset/script.yaml, fact_check)
export const BOTH_WORKED = 1000;

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> =
  ({ children, size = 120, color = C.text, style }) => (
    <div style={{ font: `800 ${size}px/1.0 "${FONT.display}"`, letterSpacing: -3, color, ...style }}>{children}</div>
  );

/** A database table as a card, with rows that can light up. */
export const Table: React.FC<{ name: string; y: number; x?: number; width?: number; color?: string; rows: { key: string; value: string; color?: string }[]; enter?: number; size?: number }> =
  ({ name, y, x = 40, width = 1000, color = C.border, rows, enter = 1, size = 34 }) => (
    <div style={{ position: "absolute", left: x, top: y, width, boxSizing: "border-box", opacity: enter, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, overflow: "hidden", boxShadow: "0 20px 44px rgba(0,0,0,.5)" }}>
      <div style={{ padding: "12px 24px", background: C.raised, font: `700 30px "${FONT.mono}"`, color: C.purple }}>{name}</div>
      {rows.map((r, n) => (
        <div key={n} style={{ display: "flex", gap: 24, padding: "8px 24px", font: `500 ${size}px "${FONT.mono}"`, color: C.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
          <span style={{ width: 90, color: C.muted }}>{r.key}</span>
          <span style={{ color: r.color ?? C.text }}>{r.value}</span>
        </div>
      ))}
    </div>
  );

const PASSWORDS = [
  { key: "1", value: "$2a$12$kZ8vQe1y7Lq0…", color: C.green },
  { key: "2", value: "$2a$12$Xw3nBd9sPt4u…", color: C.green },
  { key: "3", value: "$2a$12$Hc5rJm2fOa8i…", color: C.green },
];
const TOKENS = [
  { key: "1", value: "x7Qm2p-Lk9vZt4sW1yRb…", color: C.red },
  { key: "2", value: "aB3fN8_cJ5hT0uE6qGd…", color: C.red },
  { key: "3", value: "Yp1Vz4kR7mXw9LsD2nC…", color: C.red },
];

/** The hook (and the loop's last frame). */
export const ResetTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["Every password: hashed.", "Every account: stolen."].map((t, n) => (
      <Big key={t} size={84} color={hot === n ? (n === 1 ? C.red : C.green) : C.text}
           style={{ marginBottom: 14, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

export const HookTables: React.FC<{ tokens: number; y?: number }> = ({ tokens, y = 460 }) => (
  <>
    <Table name="users.password" y={y} rows={PASSWORDS} color={C.green} />
    <Table name="reset_tokens.token" y={y + 250} rows={TOKENS} color={C.red} enter={tokens} />
  </>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const still = at(line, "still");
  return (
    <>
      <ResetTitle hot={frame >= still ? 1 : 0} />
      <HookTables tokens={0.25 + 0.75 * ramp(frame, still, 8)} />
    </>
  );
};

/** The mail, its link, and the table that holds the same thing. */
export const Link: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const password = at(line, "password"), table = at(line, "table"), read = at(line, "read");
  const token = "x7Qm2p-Lk9vZt4sW1yRb";
  return (
    <>
      <div style={{ position: "absolute", left: 40, top: 175, width: 1000, boxSizing: "border-box", borderRadius: 26, background: C.surface, border: `3px solid ${C.blue}`, padding: "22px 28px" }}>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>From: no-reply@yourapp.example</div>
        <div style={{ font: `800 50px "${FONT.display}"`, color: C.text, marginTop: 8 }}>Reset your password</div>
        <div style={{ font: `500 36px "${FONT.mono}"`, color: C.blue, marginTop: 14, whiteSpace: "nowrap" }}>/reset?token=<span style={{ color: frame >= table ? C.red : C.amber }}>{token}</span></div>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 430, textAlign: "center", transform: `scale(${pop(frame, password)})`, font: `800 66px "${FONT.display}"`, color: C.yellow }}>whoever has this is you</div>
      <Table name="reset_tokens" y={560} color={frame >= read ? C.red : C.border} enter={ramp(frame, table - 3, 7)} rows={[
        { key: "user", value: "token" },
        { key: "1", value: token, color: C.red },
      ]} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 800, textAlign: "center", opacity: ramp(frame, read, 6), font: `800 46px "${FONT.display}"`, color: C.red }}>a backup, a replica, one SQL injection</div>
    </>
  );
};

/** The thief's only move: paste each token into the reset page. */
export const Stolen: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const first = at(line, "1,000"), second = at(line, "1,000", 2);
  const count = Math.round(interpolate(frame, [second, second + 18], [0, 1000], clamp));
  return (
    <>
      <div style={{ position: "absolute", left: 40, top: 175, width: 1000, boxSizing: "border-box", borderRadius: 24, background: "#05070a", border: `3px solid ${C.border}`, padding: "18px 26px", height: 300, overflow: "hidden" }}>
        <div style={{ font: `500 36px/1.6 "${FONT.mono}"`, color: C.green }}>$ <span style={{ color: C.text }}>reset.exe -mode=leak</span></div>
        <div style={{ font: `500 36px/1.6 "${FONT.mono}"`, color: C.muted, marginTop: 8 }}>tokens stored as they are</div>
        <div style={{ font: `700 36px/1.6 "${FONT.mono}"`, color: C.amber, opacity: ramp(frame, first - 2, 5) }}>1000 tokens stolen,</div>
        <div style={{ font: `700 36px/1.6 "${FONT.mono}"`, color: C.red, opacity: ramp(frame, second - 2, 5) }}>1000 accounts taken, 0 untouched</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 510, width: 1000, boxSizing: "border-box", opacity: ramp(frame, second - 3, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.red}`, padding: "18px 30px" }}>
        <div style={{ font: `800 170px/1.05 "${FONT.mono}"`, letterSpacing: -8, color: C.red }}>{count.toLocaleString("en-US")}</div>
        <div style={{ font: `800 46px "${FONT.display}"`, color: C.text }}>of 1,000 accounts taken</div>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>every password in the table was still hashed</div>
      </div>
    </>
  );
};

export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const store = at(line, "store"), same = at(line, "same"), zero = at(line, "0");
  return (
    <>
      <Editor file="the fix" y={165} enter={ramp(frame, 0, 8)} lines={[
        { text: "token := newToken()" },
        { text: "email(user, link + token)", hl: frame < store ? "green" : undefined },
        { text: "store(hashToken(token))", hl: frame >= store ? "green" : undefined },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 425, width: 1000, display: "flex", gap: 24, alignItems: "stretch" }}>
        <div style={{ flex: 1, borderRadius: 22, background: C.surface, border: `3px solid ${C.blue}`, padding: "16px 22px", overflow: "hidden" }}>
          <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>in the email</div>
          <div style={{ font: `700 34px "${FONT.mono}"`, color: C.blue, marginTop: 8, whiteSpace: "nowrap" }}>x7Qm2p-Lk9vZt4s…</div>
        </div>
        <div style={{ flex: 1, opacity: ramp(frame, store - 2, 6), borderRadius: 22, background: C.surface, border: `3px solid ${C.green}`, padding: "16px 22px", overflow: "hidden" }}>
          <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>in the table</div>
          <div style={{ font: `700 34px "${FONT.mono}"`, color: C.green, marginTop: 8, whiteSpace: "nowrap" }}>9f2c41e07ab3d8…</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 600, width: 1000, boxSizing: "border-box", opacity: ramp(frame, same - 3, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.green}`, padding: "18px 30px" }}>
        <div style={{ font: `800 170px/1.05 "${FONT.mono}"`, letterSpacing: -8, color: frame >= zero ? C.green : C.muted }}>{frame >= zero ? "0" : "…"}</div>
        <div style={{ font: `800 46px "${FONT.display}"`, color: C.text }}>of 1,000 accounts taken</div>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>a stolen hash doesn't open the door</div>
      </div>
    </>
  );
};

/** Why not bcrypt? Because nobody can guess 256 random bits. */
export const Fast: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const passwords = at(line, "passwords"), bits = at(line, "256");
  const row = (name: string, sample: string, verdict: string, color: string, y: number, show: number) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", opacity: show, borderRadius: 24, background: C.surface, border: `3px solid ${color}`, padding: "20px 28px" }}>
      <div style={{ font: `700 32px "${FONT.ui}"`, color: C.muted }}>{name}</div>
      <div style={{ font: `700 50px "${FONT.mono}"`, color: C.text, marginTop: 6, whiteSpace: "nowrap" }}>{sample}</div>
      <div style={{ font: `800 40px "${FONT.display}"`, color, marginTop: 8 }}>{verdict}</div>
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>SHA-256, not bcrypt</Big>
      </div>
      {row("a password", "summer2024!", "a person chose it: slow the guessing down", C.amber, 290, ramp(frame, passwords - 2, 6))}
      {row("a reset token", "x7Qm2p-Lk9vZt4sW1yRb…", "256 random bits: nothing to guess", C.green, 540, ramp(frame, bits - 2, 6))}
      <div style={{ position: "absolute", left: 40, right: 40, top: 800, textAlign: "center", opacity: ramp(frame, bits + 8, 6), font: `700 36px "${FONT.ui}"`, color: C.muted }}>and a fast hash can be looked up with an index</div>
    </>
  );
};

/** Two clicks at the same moment. */
export const Once: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const two = at(line, "two"), hundreds = at(line, "1,000"), one = at(line, "one", 1), zero = at(line, "0");
  const fixed = frame >= one;
  const count = Math.round(interpolate(frame, [hundreds - 2, hundreds + 14], [0, BOTH_WORKED], clamp));
  return (
    <>
      <div style={{ position: "absolute", left: 40, top: 165, width: 1000, display: "flex", gap: 24, opacity: ramp(frame, 0, 6) }}>
        {["first click", "second click"].map((t) => (
          <div key={t} style={{ flex: 1, borderRadius: 20, background: C.surface, border: `3px solid ${C.blue}`, padding: "14px 22px", font: `800 40px "${FONT.display}"`, color: C.text, textAlign: "center" }}>{t}</div>
        ))}
      </div>
      <Editor file={fixed ? "one statement" : "look, then write"} y={280} enter={ramp(frame, two - 2, 6)} lines={fixed ? [
        { text: "UPDATE reset_tokens SET used_at = now()", sql: true, hl: "green" },
        { text: " WHERE token_hash = $1", sql: true, hl: "green" },
        { text: "   AND used_at IS NULL", sql: true, hl: "green" },
        { text: "   AND expires_at > now()", sql: true, hl: "green" },
      ] : [
        { text: "SELECT user_id FROM reset_tokens", sql: true, hl: "red" },
        { text: " WHERE token_hash = $1 AND used_at IS NULL;", sql: true },
        { text: "-- both clicks are here at once", sql: true },
        { text: "UPDATE reset_tokens SET used_at = now() ...;", sql: true, hl: "red" },
      ]} />
      <div style={{ position: "absolute", left: 40, top: 610, width: 1000, boxSizing: "border-box", opacity: ramp(frame, hundreds - 3, 6), borderRadius: 26, background: C.surface, border: `3px solid ${frame >= zero ? C.green : C.red}`, padding: "16px 30px" }}>
        <div style={{ font: `800 150px/1.05 "${FONT.mono}"`, letterSpacing: -7, color: frame >= zero ? C.green : C.red }}>{frame >= zero ? "0" : count.toLocaleString("en-US")}</div>
        <div style={{ font: `800 44px "${FONT.display}"`, color: C.text }}>of 1,000 links worked twice</div>
      </div>
    </>
  );
};

/** The scanner gets there before the person does. */
export const Scanner: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const first = at(line, "first"), use = at(line, "use"), dead = at(line, "dead"), opening = at(line, "opening"), only = at(line, "only");
  const fixed = frame >= opening;
  const count = Math.round(interpolate(frame, [dead - 22, dead], [0, 1000], clamp));
  const lane = (who: string, what: string, color: string, y: number, show: number) => (
    <div style={{ position: "absolute", left: 40, top: y, width: 1000, boxSizing: "border-box", opacity: show, borderRadius: 20, background: C.surface, border: `3px solid ${color}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ font: `800 38px "${FONT.display}"`, color: C.text }}>{who}</span>
      <span style={{ font: `700 34px "${FONT.mono}"`, color, whiteSpace: "nowrap" }}>{what}</span>
    </div>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 170, opacity: ramp(frame, 0, 6) }}>
        <Big size={70}>{fixed ? "Opening changes nothing" : "The first click isn't yours"}</Big>
      </div>
      {lane("mail scanner", fixed ? "GET: a form, nothing used" : "GET: token used", fixed ? C.green : C.red, 280, ramp(frame, first - 2, 6))}
      {lane("the person", fixed ? "GET: the same form" : "GET: link expired", fixed ? C.green : C.red, 380, ramp(frame, use, 6))}
      {fixed && lane("the person", "POST: password changed", C.green, 480, ramp(frame, only - 2, 6))}
      {!fixed && (
        <div style={{ position: "absolute", left: 40, top: 500, width: 1000, boxSizing: "border-box", opacity: ramp(frame, use + 4, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.red}`, padding: "16px 30px" }}>
          <div style={{ font: `800 150px/1.05 "${FONT.mono}"`, letterSpacing: -7, color: C.red }}>{count.toLocaleString("en-US")}</div>
          <div style={{ font: `800 44px "${FONT.display}"`, color: C.text }}>of 1,000 links dead on arrival</div>
        </div>
      )}
      {fixed && (
        <div style={{ position: "absolute", left: 40, top: 600, width: 1000, boxSizing: "border-box", opacity: ramp(frame, only + 6, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.green}`, padding: "16px 30px" }}>
          <div style={{ font: `800 150px/1.05 "${FONT.mono}"`, letterSpacing: -7, color: C.green }}>1,000</div>
          <div style={{ font: `800 44px "${FONT.display}"`, color: C.text }}>of 1,000 people reset fine</div>
        </div>
      )}
    </>
  );
};

/** The real case: GitLab's own security notice. */
export const Gitlab: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const emails = at(line, "reset"), no = at(line, "no", 2), severity = at(line, "severity");
  const score = interpolate(frame, [severity, severity + 14], [0, 10], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={84}>GitLab, 2024</Big>
        <div style={{ font: `700 32px "${FONT.mono}"`, color: C.muted, marginTop: 10 }}>CVE-2023-7028 · their own notice</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 340, width: 1000, boxSizing: "border-box", opacity: ramp(frame, emails - 2, 6), borderRadius: 24, background: C.surface, border: `3px solid ${C.red}`, padding: "20px 28px" }}>
        <div style={{ font: `700 30px "${FONT.ui}"`, color: C.muted }}>Reset your password</div>
        <div style={{ font: `700 40px "${FONT.mono}"`, color: C.text, marginTop: 10 }}>to: <span style={{ color: C.green }}>victim@example.com</span></div>
        <div style={{ font: `700 40px "${FONT.mono}"`, color: C.text, marginTop: 6 }}>to: <span style={{ color: C.red }}>an unverified address</span></div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 590, width: 1000, opacity: ramp(frame, no - 2, 6), font: `800 50px "${FONT.display}"`, color: C.text, textAlign: "center" }}>no click from the victim</div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 680, textAlign: "center", opacity: ramp(frame, severity - 2, 6) }}>
        <div style={{ font: `800 190px/1 "${FONT.mono}"`, letterSpacing: -8, color: C.red }}>{score.toFixed(1)}</div>
        <div style={{ font: `800 44px "${FONT.display}"`, color: C.text }}>out of 10 · CVSS</div>
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const password = at(line, "password");
    return (
      <>
        <ResetTitle hot={frame >= password ? 1 : 0} />
        <HookTables tokens={1} />
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 A Link Is a Password · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>every attack tested, in real Go + SQL · PDF</div>
      </div>
    </>
  );
};
