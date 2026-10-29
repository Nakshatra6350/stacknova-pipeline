// The Reel's cover: the hook, placed inside the middle 3:4 that Instagram's profile grid shows.
import React from "react";
import { AbsoluteFill } from "remotion";
import { HookTitle } from "./scenes";
import { C, FONT } from "./theme";
import { Backdrop, Phone, TopBar } from "./ui";

export const Cover: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Backdrop glow={C.yellow} />
    <TopBar episode="#1" />
    <HookTitle top={330} />
    <Phone name="Ana" state="booked" x={40} y={930} scale={0.92} />
    <Phone name="Bo" state="booked" x={740} y={930} scale={0.92} />
    <div style={{ position: "absolute", left: 340, top: 1080, width: 400, textAlign: "center",
                  font: `800 230px "${FONT.display}"`, color: C.red }}>?</div>
  </AbsoluteFill>
);
