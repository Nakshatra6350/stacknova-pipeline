// The pilot, "The last seat": every scene from its line's start to the next line's start, the
// narration, and the captions. The hook card is on screen from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import timeline from "../public/001-last-seat/timeline.json";
import { CodeBug, CodeFix, Cta, Hook, Lock, Proof, Race, Scale, Stakes } from "./scenes";
import { C } from "./theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "./timeline";
import { Backdrop, Captions, TopBar, clamp } from "./ui";

const TL = timeline as Timeline;
export const DURATION = frames(TL.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.yellow, stakes: C.red, race: C.blue, "code-bug": C.red, "code-fix": C.green,
  lock: C.amber, proof: C.green, scale: C.blue, cta: C.yellow,
};

function scene(line: Line) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "stakes": return <Stakes line={line} />;
    case "race": return <Race line={line} />;
    case "code-bug": return <CodeBug line={line} />;
    case "code-fix": return <CodeFix line={line} />;
    case "lock": return <Lock line={line} />;
    case "proof": return <Proof line={line} />;
    case "scale": return <Scale line={line} />;
    case "cta": return <Cta line={line} keyword={TL.keyword} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

/** Every scene slides in over 6 frames and pushes in slowly while it plays, so nothing sits still. */
const Shot: React.FC<{ len: number; first: boolean; children: React.ReactNode }> = ({ len, first, children }) => {
  const frame = useCurrentFrame();
  const enter = first ? 1 : interpolate(frame, [0, 6], [0, 1], clamp);
  const push = interpolate(frame, [0, len], [1, 1.035], clamp);
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${(1 - enter) * 50}px) scale(${push})`,
                           transformOrigin: "50% 35%" }}>
      {children}
    </AbsoluteFill>
  );
};

export const LastSeat: React.FC = () => {
  const cta = TL.lines[TL.lines.length - 1];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {TL.lines.map((line, n) => {
        const from = n === 0 ? 0 : frames(line.start);
        const to = n === TL.lines.length - 1 ? DURATION : frames(TL.lines[n + 1].start);
        // a scene's own clock starts at its line's start (the first one at frame 0)
        const shifted = { ...line, start: from / FPS };
        return (
          <Sequence key={line.id} from={from} durationInFrames={to - from} name={`${line.id} ${line.scene}`}>
            <Backdrop glow={GLOW[line.scene]} />
            <Shot len={to - from} first={n === 0}>{scene({ ...shifted, words: line.words })}</Shot>
          </Sequence>
        );
      })}
      <TopBar episode="#1" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile("001-last-seat/narration.wav")} />
    </AbsoluteFill>
  );
};
