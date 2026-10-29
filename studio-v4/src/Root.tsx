import React from "react";
import { Composition } from "remotion";
import { Cover } from "./Cover";
import { LastSeat, VERSIONS, duration } from "./LastSeat";
import { FPS } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="LastSeatReel" component={LastSeat} defaultProps={{ version: "reel" as const }}
                 durationInFrames={duration(VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="LastSeatShort" component={LastSeat} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={duration(VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="LastSeatCover" component={Cover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
  </>
);
