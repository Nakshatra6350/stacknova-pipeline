// Behind the Button #5, "A billion usernames, and it opens four pages": every scene from its line's
// start to the next line's start, the narration, and the captions. The hook card is on screen from
// frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/005-name/timeline.json";
import shortTimeline from "../../public/005-name/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Bloom, Bug, Cta, Depth, Fix, Hook, Scan, Spotify, Tick, Tree } from "./scenes";

// the Instagram Reel ends on "comment NAME" (the free guide comes by DM); the YouTube Short on a follow
export const NAME_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "005-name/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "005-name/narration-youtube.wav" },
};
export const nameDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.purple, scan: C.red, tree: C.blue, depth: C.green, bug: C.red,
  fix: C.green, bloom: C.amber, tick: C.red, spotify: C.red, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "scan": return <Scan line={line} />;
    case "tree": return <Tree line={line} />;
    case "depth": return <Depth line={line} />;
    case "bug": return <Bug line={line} />;
    case "fix": return <Fix line={line} />;
    case "bloom": return <Bloom line={line} />;
    case "tick": return <Tick line={line} />;
    case "spotify": return <Spotify line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Name: React.FC<{ version: keyof typeof NAME_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = NAME_VERSIONS[version];
  const DURATION = nameDuration(TL);
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
      <TopBar episode="#5" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
