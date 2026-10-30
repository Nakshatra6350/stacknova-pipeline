// Behind the Button #2, "You tapped Pay twice": every scene from its line's start to the next
// line's start, the narration, and the captions. The hook card is on screen from frame 1 and
// comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/002-pay/timeline.json";
import shortTimeline from "../../public/002-pay/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { CodeBug, CodeFix, Cta, Hook, Key, Lost, Proof, Stakes, Stripe } from "./scenes";

// the Instagram Reel ends on "comment PAY" (the free guide comes by DM); the YouTube Short on a follow
export const PAY_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "002-pay/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "002-pay/narration-youtube.wav" },
};
export const payDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.yellow, stakes: C.red, lost: C.blue, "code-bug": C.red, key: C.yellow,
  "code-fix": C.green, proof: C.green, stripe: C.blue, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "stakes": return <Stakes line={line} />;
    case "lost": return <Lost line={line} />;
    case "code-bug": return <CodeBug line={line} />;
    case "key": return <Key line={line} />;
    case "code-fix": return <CodeFix line={line} />;
    case "proof": return <Proof line={line} />;
    case "stripe": return <Stripe line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Pay: React.FC<{ version: keyof typeof PAY_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = PAY_VERSIONS[version];
  const DURATION = payDuration(TL);
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
            <Shot len={to - from} first={n === 0}>{scene({ ...shifted, words: line.words }, TL)}</Shot>
          </Sequence>
        );
      })}
      <TopBar episode="#2" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
