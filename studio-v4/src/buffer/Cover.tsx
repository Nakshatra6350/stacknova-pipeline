// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { BufferTitle, Player } from "./scenes";

export const BufferCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.green} />
    <TopBar episode="#9" />
    <BufferTitle top={330} hot={1} />
    <Player y={600} quality="1080p" buffered={0.22} played={0.2} />
  </AbsoluteFill>
);
