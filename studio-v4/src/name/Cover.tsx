// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { FourPages, NameTitle, SignupField } from "./scenes";

export const NameCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.purple} />
    <TopBar episode="#5" />
    <NameTitle top={330} hot={1} />
    <SignupField y={680} typed="alice" state="taken" ms="0.2 ms" />
    <FourPages y={960} shown={4} />
  </AbsoluteFill>
);
