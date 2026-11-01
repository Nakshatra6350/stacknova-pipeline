// Behind the Button #4, "One more view, and the counter goes negative": every scene from its line's
// start to the next line's start, the narration, and the captions. The hook card is on screen from
// frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/004-views/timeline.json";
import shortTimeline from "../../public/004-views/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Basecamp, Bits, Bug, Cta, Fix, Hook, Proof, Stakes, Wrap, Youtube } from "./scenes";

// the Instagram Reel ends on "comment VIEWS" (the free guide comes by DM); the YouTube Short on a follow
export const VIEWS_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "004-views/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "004-views/narration-youtube.wav" },
};
export const viewsDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.red, stakes: C.yellow, bits: C.green, wrap: C.red, youtube: C.green,
  bug: C.red, fix: C.green, proof: C.green, basecamp: C.red, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "stakes": return <Stakes line={line} />;
    case "bits": return <Bits line={line} />;
    case "wrap": return <Wrap line={line} />;
    case "youtube": return <Youtube line={line} />;
    case "bug": return <Bug line={line} />;
    case "fix": return <Fix line={line} />;
    case "proof": return <Proof line={line} />;
    case "basecamp": return <Basecamp line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Views: React.FC<{ version: keyof typeof VIEWS_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = VIEWS_VERSIONS[version];
  const DURATION = viewsDuration(TL);
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
      <TopBar episode="#4" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
