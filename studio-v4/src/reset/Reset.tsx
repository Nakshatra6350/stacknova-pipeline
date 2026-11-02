// Behind the Button #7, "Every password was hashed, and every account was still stolen": every scene
// from its line's start to the next line's start, the narration, and the captions. The hook card is on
// screen from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/007-reset/timeline.json";
import shortTimeline from "../../public/007-reset/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Cta, Fast, Fix, Gitlab, Hook, Link, Once, Scanner, Stolen } from "./scenes";

// the Instagram Reel ends on "comment RESET" (the free guide comes by DM); the YouTube Short on a follow
export const RESET_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "007-reset/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "007-reset/narration-youtube.wav" },
};
export const resetDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.red, link: C.amber, stolen: C.red, fix: C.green, fast: C.blue,
  once: C.amber, scanner: C.red, gitlab: C.red, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "link": return <Link line={line} />;
    case "stolen": return <Stolen line={line} />;
    case "fix": return <Fix line={line} />;
    case "fast": return <Fast line={line} />;
    case "once": return <Once line={line} />;
    case "scanner": return <Scanner line={line} />;
    case "gitlab": return <Gitlab line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Reset: React.FC<{ version: keyof typeof RESET_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = RESET_VERSIONS[version];
  const DURATION = resetDuration(TL);
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
      <TopBar episode="#7" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
