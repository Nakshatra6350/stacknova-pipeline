// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { PageTitle, Timings } from "./scenes";

export const PageCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.red} />
    <TopBar episode="#12" />
    <PageTitle top={330} hot={1} />
    <Timings y={620} deep={1} />
  </AbsoluteFill>
);
