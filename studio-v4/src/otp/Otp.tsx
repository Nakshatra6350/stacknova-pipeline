// Behind the Button #3, "Why your OTP dies in 30 seconds": every scene from its line's start to the
// next line's start, the narration, and the captions. The hook card is on screen from frame 1 and
// comes back at the end.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import reelTimeline from "../../public/003-otp/timeline.json";
import shortTimeline from "../../public/003-otp/timeline-youtube.json";
import { Shot } from "../LastSeat";
import { C } from "../theme";
import { FPS, Line, TAIL, Timeline, frames, wordAt } from "../timeline";
import { Backdrop, Captions, TopBar } from "../ui";
import { Bug, Code, Cta, Dies, Fix, Hook, Proof, Retool, Secret, Stakes } from "./scenes";

// the Instagram Reel ends on "comment OTP" (the free guide comes by DM); the YouTube Short on a follow
export const OTP_VERSIONS = {
  reel: { tl: reelTimeline as Timeline, audio: "003-otp/narration.wav" },
  youtube: { tl: shortTimeline as Timeline, audio: "003-otp/narration-youtube.wav" },
};
export const otpDuration = (tl: Timeline) => frames(tl.duration + TAIL);

const GLOW: Record<string, string> = {
  hook: C.yellow, stakes: C.blue, secret: C.yellow, code: C.green, dies: C.red,
  bug: C.red, fix: C.green, proof: C.green, retool: C.red, cta: C.yellow,
};

function scene(line: Line, tl: Timeline) {
  switch (line.scene) {
    case "hook": return <Hook line={line} />;
    case "stakes": return <Stakes line={line} />;
    case "secret": return <Secret line={line} />;
    case "code": return <Code line={line} />;
    case "dies": return <Dies line={line} />;
    case "bug": return <Bug line={line} />;
    case "fix": return <Fix line={line} />;
    case "proof": return <Proof line={line} />;
    case "retool": return <Retool line={line} />;
    case "cta": return <Cta line={line} keyword={tl.keyword} variant={(tl as Timeline & { variant: string }).variant} />;
    default: throw new Error(`no scene called ${line.scene}`);
  }
}

export const Otp: React.FC<{ version: keyof typeof OTP_VERSIONS }> = ({ version }) => {
  const { tl: TL, audio } = OTP_VERSIONS[version];
  const DURATION = otpDuration(TL);
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
      <TopBar episode="#3" />
      <Captions timeline={TL} until={cta.start + wordAt(cta, "because")} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
