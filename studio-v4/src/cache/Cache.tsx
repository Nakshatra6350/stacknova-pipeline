// Behind the Button #10, "One key expired, and the database got 1,000 queries": every scene from its
// line's start to the next line's start, the narration, and the captions. The hook card is on screen
// from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/010-cache/timeline.json";
import shortTimeline from "../../public/010-cache/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Cta, Facebook, Flight, Hit, Hook, Query, Stale, Stampede, Together } from "./scenes";

// the Instagram Reel ends on "comment CACHE" (the free guide comes by DM); the YouTube Short on a follow
export const CACHE_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "010-cache/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "010-cache/narration-youtube.wav" },
};
export const cacheDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.red, query: C.amber, hit: C.green, stampede: C.red, flight: C.green,
  stale: C.green, together: C.red, facebook: C.red, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "query": return <Query line={line} />;
    case "hit": return <Hit line={line} />;
    case "stampede": return <Stampede line={line} />;
    case "flight": return <Flight line={line} />;
    case "stale": return <Stale line={line} />;
    case "together": return <Together line={line} />;
    case "facebook": return <Facebook line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Cache: React.FC<{ version: keyof typeof CACHE_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = CACHE_VERSIONS[version];
  const DURATION = cacheDuration(TL);
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
      <TopBar episode="#10" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
