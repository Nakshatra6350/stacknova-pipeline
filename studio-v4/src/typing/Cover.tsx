// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { ChatBar, SignalCard, TypingTitle } from "./scenes";

export const TypingCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.red} />
    <TopBar episode="#6" />
    <TypingTitle top={330} hot={1} />
    <ChatBar y={600} typing still />
    <SignalCard y={880} lost={1} />
  </AbsoluteFill>
);
