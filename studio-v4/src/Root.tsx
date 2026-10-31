import React from "react";
import { Composition } from "remotion";
import { Cover } from "./Cover";
import { LastSeat, VERSIONS, duration } from "./LastSeat";
import { OtpCover } from "./otp/Cover";
import { OTP_VERSIONS, Otp, otpDuration } from "./otp/Otp";
import { PayCover } from "./pay/Cover";
import { PAY_VERSIONS, Pay, payDuration } from "./pay/Pay";
import { FPS } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="LastSeatReel" component={LastSeat} defaultProps={{ version: "reel" as const }}
                 durationInFrames={duration(VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="LastSeatShort" component={LastSeat} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={duration(VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="LastSeatCover" component={Cover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="PayReel" component={Pay} defaultProps={{ version: "reel" as const }}
                 durationInFrames={payDuration(PAY_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="PayShort" component={Pay} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={payDuration(PAY_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="PayCover" component={PayCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="OtpReel" component={Otp} defaultProps={{ version: "reel" as const }}
                 durationInFrames={otpDuration(OTP_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="OtpShort" component={Otp} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={otpDuration(OTP_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="OtpCover" component={OtpCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
  </>
);
