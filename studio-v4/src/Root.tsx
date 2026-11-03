import React from "react";
import { Composition } from "remotion";
import { BufferCover } from "./buffer/Cover";
import { BUFFER_VERSIONS, Buffer, bufferDuration } from "./buffer/Buffer";
import { Cover } from "./Cover";
import { DriverCover } from "./driver/Cover";
import { DRIVER_VERSIONS, Driver, driverDuration } from "./driver/Driver";
import { LastSeat, VERSIONS, duration } from "./LastSeat";
import { NameCover } from "./name/Cover";
import { NAME_VERSIONS, Name, nameDuration } from "./name/Name";
import { OtpCover } from "./otp/Cover";
import { OTP_VERSIONS, Otp, otpDuration } from "./otp/Otp";
import { PayCover } from "./pay/Cover";
import { PAY_VERSIONS, Pay, payDuration } from "./pay/Pay";
import { ResetCover } from "./reset/Cover";
import { RESET_VERSIONS, Reset, resetDuration } from "./reset/Reset";
import { FPS } from "./timeline";
import { TypingCover } from "./typing/Cover";
import { TYPING_VERSIONS, Typing, typingDuration } from "./typing/Typing";
import { ViewsCover } from "./views/Cover";
import { VIEWS_VERSIONS, Views, viewsDuration } from "./views/Views";

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
    <Composition id="ViewsReel" component={Views} defaultProps={{ version: "reel" as const }}
                 durationInFrames={viewsDuration(VIEWS_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="ViewsShort" component={Views} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={viewsDuration(VIEWS_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="ViewsCover" component={ViewsCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="NameReel" component={Name} defaultProps={{ version: "reel" as const }}
                 durationInFrames={nameDuration(NAME_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="NameShort" component={Name} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={nameDuration(NAME_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="NameCover" component={NameCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="TypingReel" component={Typing} defaultProps={{ version: "reel" as const }}
                 durationInFrames={typingDuration(TYPING_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="TypingShort" component={Typing} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={typingDuration(TYPING_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="TypingCover" component={TypingCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="ResetReel" component={Reset} defaultProps={{ version: "reel" as const }}
                 durationInFrames={resetDuration(RESET_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="ResetShort" component={Reset} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={resetDuration(RESET_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="ResetCover" component={ResetCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="DriverReel" component={Driver} defaultProps={{ version: "reel" as const }}
                 durationInFrames={driverDuration(DRIVER_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="DriverShort" component={Driver} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={driverDuration(DRIVER_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="DriverCover" component={DriverCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
    <Composition id="BufferReel" component={Buffer} defaultProps={{ version: "reel" as const }}
                 durationInFrames={bufferDuration(BUFFER_VERSIONS.reel.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="BufferShort" component={Buffer} defaultProps={{ version: "youtube" as const }}
                 durationInFrames={bufferDuration(BUFFER_VERSIONS.youtube.tl)} fps={FPS} width={1080} height={1920} />
    <Composition id="BufferCover" component={BufferCover} durationInFrames={1} fps={FPS} width={1080} height={1920} />
  </>
);
