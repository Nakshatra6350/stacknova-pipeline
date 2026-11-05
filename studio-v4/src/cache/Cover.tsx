// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { CacheCard, CacheTitle, DbCard } from "./scenes";

export const CacheCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.red} />
    <TopBar episode="#10" />
    <CacheTitle top={330} hot={1} />
    <CacheCard x={40} y={600} state="expired" />
    <DbCard x={560} y={600} queries={1000} />
  </AbsoluteFill>
);
