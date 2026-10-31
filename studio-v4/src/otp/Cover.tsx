// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { AuthPhone, OtpTitle } from "./scenes";

export const OtpCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.yellow} />
    <TopBar episode="#3" />
    <OtpTitle top={330} />
    <AuthPhone code="070226" secs={21} x={160} y={840} scale={0.92} />
    <div style={{ position: "absolute", left: 520, top: 980, font: `800 128px/1.02 "${FONT.display}"`, color: C.green }}>You're<br />in ✓</div>
  </AbsoluteFill>
);
