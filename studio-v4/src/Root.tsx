import React from "react";
import { Composition } from "remotion";
import { DURATION, LastSeat } from "./LastSeat";
import { FPS } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <Composition id="LastSeat" component={LastSeat} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
);
