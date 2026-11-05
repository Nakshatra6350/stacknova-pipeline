// Behind the Button #11, "My limit was 100 a minute. 200 got through": every scene from its
// line's start to the next line's start, the narration, and the captions. The hook card is on screen
// from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/011-rate/timeline.json";
import shortTimeline from "../../public/011-rate/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Accounts, Answer, Bucket, Cta, Edge, Hook, Race, Real, Servers } from "./scenes";

// the Instagram Reel ends on "comment RATE" (the free guide comes by DM); the YouTube Short on a follow
export const RATE_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "011-rate/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "011-rate/narration-youtube.wav" },
};
export const rateDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.red, edge: C.amber, bucket: C.green, servers: C.red, race: C.red, accounts: C.amber, answer: C.red, real: C.blue, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "edge": return <Edge line={line} />;
    case "bucket": return <Bucket line={line} />;
    case "servers": return <Servers line={line} />;
    case "race": return <Race line={line} />;
    case "accounts": return <Accounts line={line} />;
    case "answer": return <Answer line={line} />;
    case "real": return <Real line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Rate: React.FC<{ version: keyof typeof RATE_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = RATE_VERSIONS[version];
  const DURATION = rateDuration(TL);
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
      <TopBar episode="#11" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
