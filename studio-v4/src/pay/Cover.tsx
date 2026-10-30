// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT } from "../theme";
import { Backdrop, TopBar } from "../ui";
import { CheckoutPhone, PayTitle } from "./scenes";

export const PayCover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.yellow} />
    <TopBar episode="#2" />
    <PayTitle top={330} />
    <CheckoutPhone state="paid" x={300} y={860} scale={0.92} charged={[-30, -30]} />
    <div style={{ position: "absolute", left: 690, top: 1010, font: `800 170px "${FONT.display}"`, color: C.red }}>×2</div>
  </AbsoluteFill>
);
