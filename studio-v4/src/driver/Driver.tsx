// Behind the Button #8, "Your nearest driver is in the wrong square": every scene from its
// line's start to the next line's start, the narration, and the captions. The hook card is on screen
// from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/008-driver/timeline.json";
import shortTimeline from "../../public/008-driver/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Bug, Cta, Degrees, Fix, Grid, Hook, Index, Scan, Uber } from "./scenes";

// the Instagram Reel ends on "comment DRIVER" (the free guide comes by DM); the YouTube Short on a follow
export const DRIVER_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "008-driver/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "008-driver/narration-youtube.wav" },
};
export const driverDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.red, scan: C.amber, grid: C.purple, bug: C.red, fix: C.green,
  degrees: C.red, index: C.green, uber: C.blue, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "scan": return <Scan line={line} />;
    case "grid": return <Grid line={line} />;
    case "bug": return <Bug line={line} />;
    case "fix": return <Fix line={line} />;
    case "degrees": return <Degrees line={line} />;
    case "index": return <Index line={line} />;
    case "uber": return <Uber line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Driver: React.FC<{ version: keyof typeof DRIVER_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = DRIVER_VERSIONS[version];
  const DURATION = driverDuration(TL);
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
      <TopBar episode="#8" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
