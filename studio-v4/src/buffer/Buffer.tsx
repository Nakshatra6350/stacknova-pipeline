// Behind the Button #9, "Netflix tested a player that mostly ignores your speed": every scene from its
// line's start to the next line's start, the narration, and the captions. The hook card is on screen
// from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/009-buffer/timeline.json";
import shortTimeline from "../../public/009-buffer/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Cta, Fix, Hook, Netflix, Pieces, Proof, Speed, Why } from "./scenes";

// the Instagram Reel ends on "comment BUFFER" (the free guide comes by DM); the YouTube Short on a follow
export const BUFFER_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "009-buffer/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "009-buffer/narration-youtube.wav" },
};
export const bufferDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.green, pieces: C.blue, speed: C.red, why: C.red, fix: C.green,
  proof: C.green, netflix: C.red, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "pieces": return <Pieces line={line} />;
    case "speed": return <Speed line={line} />;
    case "why": return <Why line={line} />;
    case "fix": return <Fix line={line} />;
    case "proof": return <Proof line={line} />;
    case "netflix": return <Netflix line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Buffer: React.FC<{ version: keyof typeof BUFFER_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = BUFFER_VERSIONS[version];
  const DURATION = bufferDuration(TL);
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
      <TopBar episode="#9" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
