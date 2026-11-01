// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { ViewCard, ViewsTitle } from "./scenes";

export const ViewsCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.red} />
    <TopBar episode="#4" />
    <ViewsTitle top={330} hot={1} />
    <ViewCard y={680} count="-2,147,483,648" broken={1} />
  </AbsoluteFill>
);
