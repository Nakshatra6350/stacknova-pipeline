// The nine scenes of Behind the Button #8, "Your nearest driver is in the wrong square"
// (content/v4/008-driver/script.yaml). Each scene runs from its line's start until the next line
// starts, and times its beats to its line's words. The numbers are real: java Drivers scan, grid,
// degrees and knn (samples/java), on 1,000,000 drivers in PostgreSQL 16.
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

// the map: 3 x 3 cells of 300 px (the middle one is x 390-690, y 320-620), the rider near its right edge
const CELL = 300, MAP_X = 90, RIDER = { x: 650, y: 470 };
const NEAR = { x: 720, y: 450 }; // just over the line, in the next cell: 73 px away
const FAR = { x: 540, y: 400 }; // the best one in the rider's own cell: 130 px away
const OTHERS = [{ x: 140, y: 190 }, { x: 640, y: 690 }, { x: 760, y: 240 }, { x: 230, y: 700 }, { x: 600, y: 160 }, { x: 820, y: 760 }];

/** A dark map with a 3 x 3 grid, a rider and drivers; cells and lines can light up. */
export const MapGrid: React.FC<{ y: number; own?: number; nine?: number; far?: number; near?: number; labels?: number; grid?: number }> =
  ({ y, own = 0, nine = 0, far = 0, near = 0, labels = 0, grid = 1 }) => {
    const frame = useCurrentFrame();
    const cars = [FAR, NEAR, ...OTHERS];
    const hashes = ["gcpvhv", "gcpvjj", "gcpvjn", "gcpvht", "gcpvjh", "gcpvjk", "gcpvhs", "gcpvj5", "gcpvj7"];
    return (
      <svg style={{ position: "absolute", left: 0, top: y, width: 1080, height: 920, overflow: "visible" }} viewBox="0 0 1080 920">
        <rect x={MAP_X} y={20} width={CELL * 3} height={CELL * 3} rx={24} fill="#0f141c" stroke={C.border} strokeWidth={3} />
        {/* streets, for the feel of a map */}
        {[150, 330, 520, 700, 860].map((v, i) => (
          <line key={`h${i}`} x1={MAP_X} y1={v} x2={MAP_X + CELL * 3} y2={v + (i % 2 ? 40 : -30)} stroke="#1c2431" strokeWidth={10} />
        ))}
        {[200, 420, 610, 800].map((v, i) => (
          <line key={`v${i}`} x1={v} y1={20} x2={v + (i % 2 ? -50 : 30)} y2={20 + CELL * 3} stroke="#1c2431" strokeWidth={10} />
        ))}
        {nine > 0 && <rect x={MAP_X} y={20} width={CELL * 3} height={CELL * 3} rx={24} fill={C.green} opacity={0.12 * nine} />}
        {own > 0 && <rect x={MAP_X + CELL} y={20 + CELL} width={CELL} height={CELL} fill={C.blue} opacity={0.22 * own} stroke={C.blue} strokeWidth={6} />}
        {/* the grid lines */}
        {[1, 2].map((i) => (
          <g key={i} opacity={grid}>
            <line x1={MAP_X + CELL * i} y1={20} x2={MAP_X + CELL * i} y2={20 + CELL * 3} stroke={C.purple} strokeWidth={4} strokeDasharray="14 10" />
            <line x1={MAP_X} y1={20 + CELL * i} x2={MAP_X + CELL * 3} y2={20 + CELL * i} stroke={C.purple} strokeWidth={4} strokeDasharray="14 10" />
          </g>
        ))}
        {labels > 0 && hashes.map((h, i) => (
          <text key={h} x={MAP_X + CELL * (i % 3) + 18} y={20 + CELL * Math.floor(i / 3) + 40} fill={C.purple} opacity={labels}
                style={{ font: `700 26px "${FONT.mono}"` }}>{h}</text>
        ))}
        {/* lines from the rider */}
        {far > 0 && <line x1={RIDER.x} y1={RIDER.y} x2={RIDER.x + (FAR.x - RIDER.x) * far} y2={RIDER.y + (FAR.y - RIDER.y) * far} stroke={C.red} strokeWidth={6} strokeDasharray="12 8" />}
        {near > 0 && <line x1={RIDER.x} y1={RIDER.y} x2={RIDER.x + (NEAR.x - RIDER.x) * near} y2={RIDER.y + (NEAR.y - RIDER.y) * near} stroke={C.green} strokeWidth={7} />}
        {cars.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={17} fill={i === 1 && near > 0 ? C.green : i === 0 && far > 0 ? C.red : C.amber} stroke="#0a0d12" strokeWidth={4} />
            <rect x={p.x - 8} y={p.y - 4} width={16} height={8} rx={3} fill="#0a0d12" />
          </g>
        ))}
        <circle cx={RIDER.x} cy={RIDER.y} r={30 + 8 * Math.sin(frame / 6)} fill={C.blue} opacity={0.25} />
        <circle cx={RIDER.x} cy={RIDER.y} r={18} fill={C.blue} stroke="#fff" strokeWidth={5} />
        {near > 0.9 && <text x={NEAR.x + 26} y={NEAR.y - 18} fill={C.green} style={{ font: `800 34px "${FONT.display}"` }}>nearest</text>}
        {far > 0.9 && <text x={FAR.x - 150} y={FAR.y - 24} fill={C.red} style={{ font: `800 34px "${FONT.display}"` }}>picked</text>}
      </svg>
    );
  };

/** The hook (and the loop's last frame). */
export const DriverTitle: React.FC<{ hot?: number; top?: number }> = ({ hot = -1, top = 190 }) => (
  <div style={{ position: "absolute", left: 60, top }}>
    {["Your nearest driver", "is in the wrong square."].map((t, n) => (
      <Big key={t} size={88} color={hot === n ? (n === 1 ? C.red : C.yellow) : C.text}
           style={{ marginBottom: 12, whiteSpace: "nowrap" }}>{t}</Big>
    ))}
  </div>
);

export const Hook: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const wrong = at(line, "wrong");
  return (
    <>
      <DriverTitle hot={frame >= wrong ? 1 : 0} />
      <div style={{ position: "absolute", left: 0, top: 380, width: 1080, height: 920, transform: "scale(0.72)", transformOrigin: "50% 0" }}>
        <MapGrid y={0} own={1} far={1} near={ramp(frame, wrong, 8)} />
      </div>
    </>
  );
};

/** Every driver, every time. */
export const Scan: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const million = at(line, "1"), second = at(line, "second");
  const share = interpolate(frame, [million, second], [0, 1], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={80}>Check every driver</Big>
      </div>
      <svg style={{ position: "absolute", left: 0, top: 290, width: 1080, height: 520 }} viewBox="0 0 1080 520">
        {Array.from({ length: 140 }).map((_, i) => {
          const x = 70 + ((i * 397) % 940), y = 20 + ((i * 211) % 480);
          const lit = i / 140 < share;
          return (
            <g key={i}>
              {lit && <line x1={540} y1={260} x2={x} y2={y} stroke={C.amber} strokeWidth={1.5} opacity={0.35} />}
              <circle cx={x} cy={y} r={7} fill={lit ? C.amber : "#364050"} />
            </g>
          );
        })}
        <circle cx={540} cy={260} r={20} fill={C.blue} stroke="#fff" strokeWidth={5} />
      </svg>
      <div style={{ position: "absolute", left: 40, top: 830, width: 1000, display: "flex", gap: 24 }}>
        <div style={{ flex: 1, borderRadius: 22, background: C.surface, border: `3px solid ${C.border}`, padding: "14px 22px" }}>
          <div style={{ font: `700 28px "${FONT.ui}"`, color: C.muted }}>drivers measured</div>
          <div style={{ font: `800 56px "${FONT.mono}"`, letterSpacing: -2, color: C.text }}>{Math.round(share * 1_000_000).toLocaleString("en-US")}</div>
        </div>
        <div style={{ flex: 1, borderRadius: 22, background: C.surface, border: `3px solid ${C.red}`, padding: "14px 22px", opacity: ramp(frame, second - 6, 6) }}>
          <div style={{ font: `700 28px "${FONT.ui}"`, color: C.muted }}>one rider</div>
          <div style={{ font: `800 56px "${FONT.mono}"`, letterSpacing: -2, color: C.red }}>600 ms</div>
        </div>
      </div>
    </>
  );
};

export const Grid: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const squares = at(line, "squares"), yours = at(line, "yours");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={78}>Cut the map into squares</Big>
        <div style={{ font: `700 32px "${FONT.mono}"`, color: C.muted, marginTop: 10, opacity: ramp(frame, squares, 6) }}>each one has a name: a geohash</div>
      </div>
      <MapGrid y={320} grid={ramp(frame, squares - 4, 8)} labels={ramp(frame, squares + 4, 8)} own={ramp(frame, yours, 6)} />
    </>
  );
};

export const Bug: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const third = at(line, "third"), nearest = at(line, "nearest"), line2 = at(line, "line");
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, height: 920, transform: "scale(0.7)", transformOrigin: "50% 0" }}>
        <MapGrid y={0} own={1} far={ramp(frame, 0, 10)} near={ramp(frame, line2 - 2, 8)} />
      </div>
      <div style={{ position: "absolute", left: 40, top: 820, width: 1000, boxSizing: "border-box", opacity: ramp(frame, third - 3, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.red}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ font: `800 120px/1 "${FONT.mono}"`, letterSpacing: -6, color: C.red }}>34%</div>
        <div>
          <div style={{ font: `800 40px/1.15 "${FONT.display}"`, color: C.text }}>further driver, or none</div>
          <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted, marginTop: 6 }}>1,710 of 5,000 riders · 5,000 drivers a city</div>
        </div>
      </div>
      <Stamp text="OVER THE LINE" color={C.green} at={nearest + 4} x={540} y={700} rotate={-4} />
    </>
  );
};

export const Fix: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const eight = at(line, "8"), further = at(line, "further"), zero = at(line, "0");
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, height: 920, transform: "scale(0.7)", transformOrigin: "50% 0" }}>
        <MapGrid y={0} own={1} nine={ramp(frame, eight - 2, 8)} near={ramp(frame, further, 8)} />
      </div>
      <div style={{ position: "absolute", left: 40, top: 820, width: 1000, boxSizing: "border-box", opacity: ramp(frame, zero - 3, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.green}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ font: `800 120px/1 "${FONT.mono}"`, letterSpacing: -6, color: C.green }}>0</div>
        <div>
          <div style={{ font: `800 40px/1.15 "${FONT.display}"`, color: C.text }}>wrong, searching outward</div>
          <div style={{ font: `700 26px "${FONT.mono}"`, color: C.muted, marginTop: 6 }}>quiet and busy cities · 15,000 riders</div>
        </div>
      </div>
    </>
  );
};

const CITIES = [
  { name: "Singapore", lat: "1°N", km: 111.2, wrong: 0 },
  { name: "Mumbai", lat: "19°N", km: 105.1, wrong: 29 },
  { name: "London", lat: "52°N", km: 69.2, wrong: 177 },
  { name: "Oslo", lat: "60°N", km: 55.7, wrong: 280 },
];

/** One degree of longitude, city by city, and how often degrees picked wrong. */
export const Degrees: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const shrink = at(line, "shrink"), oslo = at(line, "oslo");
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={74}>1 degree of longitude</Big>
      </div>
      <div style={{ position: "absolute", left: 40, top: 300, width: 1000 }}>
        {CITIES.map((c, i) => {
          const show = ramp(frame, shrink + i * 5, 6);
          const hot = c.name === "Oslo" && frame >= oslo;
          return (
            <div key={c.name} style={{ marginBottom: 26, opacity: show }}>
              <div style={{ display: "flex", justifyContent: "space-between", font: `800 38px "${FONT.display}"`, color: hot ? C.red : C.text }}>
                <span>{c.name} <span style={{ font: `700 28px "${FONT.mono}"`, color: C.muted }}>{c.lat}</span></span>
                <span style={{ font: `800 38px "${FONT.mono}"` }}>{c.km} km</span>
              </div>
              <div style={{ marginTop: 8, height: 30, width: `${(c.km / 111.2) * 100}%`, borderRadius: 15, background: hot ? C.red : C.blue }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 40, top: 820, width: 1000, boxSizing: "border-box", opacity: ramp(frame, oslo, 6), borderRadius: 26, background: C.surface, border: `3px solid ${C.red}`, padding: "14px 28px", display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ font: `800 110px/1 "${FONT.mono}"`, letterSpacing: -5, color: C.red }}>280</div>
        <div style={{ font: `800 38px/1.15 "${FONT.display}"`, color: C.text }}>of 1,000 riders in Oslo got the wrong driver<br /><span style={{ font: `700 26px "${FONT.mono}"`, color: C.muted }}>Singapore: 0</span></div>
      </div>
    </>
  );
};

export const Index: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const nearest = at(line, "nearest"), under = at(line, "under"), none = at(line, "none");
  return (
    <>
      <Editor file="one index on the real Earth" y={165} enter={ramp(frame, 0, 8)} lines={[
        { text: "CREATE INDEX ON drivers USING gist", sql: true },
        { text: "  (ll_to_earth(lat, lon));", sql: true },
        { text: "", sql: true },
        { text: "SELECT id FROM drivers", sql: true },
        { text: "ORDER BY ll_to_earth(lat, lon)", sql: true, hl: frame >= nearest ? "green" : undefined },
        { text: "      <-> ll_to_earth(?, ?) LIMIT 1;", sql: true, hl: frame >= nearest ? "green" : undefined },
      ]} />
      <div style={{ position: "absolute", left: 40, right: 40, top: 600, textAlign: "center", transform: `scale(${pop(frame, under)})` }}>
        <span style={{ font: `800 70px "${FONT.mono}"`, letterSpacing: -3, color: C.muted, textDecoration: `line-through 6px ${C.red}` }}>600 ms</span>
        <span style={{ font: `800 70px "${FONT.mono}"`, color: C.muted }}> → </span>
        <span style={{ font: `800 128px "${FONT.mono}"`, letterSpacing: -6, color: C.green }}>1.5 ms</span>
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 800, textAlign: "center", opacity: ramp(frame, none - 2, 6), font: `800 50px "${FONT.display}"`, color: C.green }}>0 wrong, checked against every driver</div>
    </>
  );
};

/** Hexagons: one distance to every neighbour. */
export const Uber: React.FC<SceneProps> = ({ line }) => {
  const frame = useCurrentFrame();
  const hexagons = at(line, "hexagons"), same = at(line, "same"), surge = at(line, "surge");
  const R = 95, cx = 540, cy = 560;
  const hex = (x: number, y: number) => Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    return `${x + R * Math.cos(a)},${y + R * Math.sin(a)}`;
  }).join(" ");
  const ring = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k;
    return { x: cx + Math.sqrt(3) * R * Math.cos(a), y: cy + Math.sqrt(3) * R * Math.sin(a) };
  });
  const heat = [C.red, C.amber, C.green, C.amber, C.red, C.amber];
  return (
    <>
      <div style={{ position: "absolute", left: 60, top: 175, opacity: ramp(frame, 0, 6) }}>
        <Big size={80}>Uber: hexagons</Big>
        <div style={{ font: `700 30px "${FONT.mono}"`, color: C.muted, marginTop: 10 }}>H3 · their own engineering blog, 2018</div>
      </div>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1100 }} viewBox="0 0 1080 1100">
        {[{ x: cx, y: cy }, ...ring].map((p, i) => {
          const show = ramp(frame, hexagons + i * 2, 6);
          const fill = frame >= surge ? (i === 0 ? C.red : heat[i - 1]) : C.surface;
          return <polygon key={i} points={hex(p.x, p.y)} fill={fill} fillOpacity={frame >= surge ? 0.4 : 1} stroke={C.blue} strokeWidth={4} opacity={show} />;
        })}
        {ring.map((p, i) => (
          <line key={i} x1={cx} y1={cy} x2={cx + (p.x - cx) * ramp(frame, same, 10)} y2={cy + (p.y - cy) * ramp(frame, same, 10)} stroke={C.green} strokeWidth={5} />
        ))}
        <circle cx={cx} cy={cy} r={12} fill={C.green} />
      </svg>
      <div style={{ position: "absolute", left: 40, right: 40, top: 900, textAlign: "center", opacity: ramp(frame, same + 6, 6), font: `800 44px "${FONT.display}"`, color: C.green }}>
        {frame >= surge ? "surge priced, hexagon by hexagon" : "6 neighbours, 1 distance"}
      </div>
    </>
  );
};

/** The call to action, then the hook again, so the loop starts where it ended. */
export const Cta: React.FC<SceneProps & { keyword: string; variant: string }> = ({ line, keyword, variant }) => {
  const frame = useCurrentFrame();
  const back = at(line, "because");
  if (frame >= back) {
    const next = at(line, "next", 1);
    return (
      <>
        <DriverTitle hot={frame >= next ? 1 : 0} />
        <div style={{ position: "absolute", left: 0, top: 380, width: 1080, height: 920, transform: "scale(0.72)", transformOrigin: "50% 0" }}>
          <MapGrid y={0} own={1} far={1} near={1} />
        </div>
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
        <div style={{ font: `800 40px "${FONT.display}"`, color: C.text, marginTop: 6 }}>📘 The Next Square · free guide</div>
        <div style={{ font: `500 28px "${FONT.ui}"`, color: C.muted, marginTop: 6 }}>every case tested, in real Java + SQL · PDF</div>
      </div>
    </>
  );
};
