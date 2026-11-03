// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { DriverTitle, MapGrid } from "./scenes";

export const DriverCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.red} />
    <TopBar episode="#8" />
    <DriverTitle top={330} hot={1} />
    <div style={{ position: "absolute", left: 0, top: 560, width: 1080, height: 920, transform: "scale(0.8)", transformOrigin: "50% 0" }}>
      <MapGrid y={0} own={1} far={1} near={1} />
    </div>
  </AbsoluteFill>
);
