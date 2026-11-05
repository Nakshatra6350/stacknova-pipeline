// Behind the Button #12, "Page 1 is instant. Page 100,000 isn't": every scene from its
// line's start to the next line's start, the narration, and the captions. The hook card is on screen
// from frame 1 and comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/012-page/timeline.json";
import shortTimeline from "../../public/012-page/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Count, Cta, Deleted, Drift, Hook, Keyset, Offset, Slack, Ties } from "./scenes";

// the Instagram Reel ends on "comment PAGE" (the free guide comes by DM); the YouTube Short on a follow
export const PAGE_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "012-page/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "012-page/narration-youtube.wav" },
};
export const pageDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.red, offset: C.red, keyset: C.green, drift: C.amber, deleted: C.red, ties: C.red, count: C.amber, slack: C.blue, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "offset": return <Offset line={line} />;
    case "keyset": return <Keyset line={line} />;
    case "drift": return <Drift line={line} />;
    case "deleted": return <Deleted line={line} />;
    case "ties": return <Ties line={line} />;
    case "count": return <Count line={line} />;
    case "slack": return <Slack line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Page: React.FC<{ version: keyof typeof PAGE_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = PAGE_VERSIONS[version];
  const DURATION = pageDuration(TL);
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
      <TopBar episode="#12" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
