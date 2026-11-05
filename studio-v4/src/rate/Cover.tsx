// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { Boundary, RateTitle } from "./scenes";

export const RateCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.red} />
    <TopBar episode="#11" />
    <RateTitle top={330} hot={1} />
    <Boundary y={620} before={100} after={100} />
  </AbsoluteFill>
);
