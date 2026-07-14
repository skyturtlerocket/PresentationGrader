"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";

export type VideoPlayerHandle = {
  seekTo: (seconds: number) => void;
};

type VideoPlayerProps = {
  src: string;
  className?: string;
};

/**
 * Thin video.js wrapper. Exposes `seekTo` via ref so the evidence-linked
 * report (step 5) can jump the player to an evidence item's timestamp.
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src, className }, ref) {
    const videoRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<Player | null>(null);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        playerRef.current?.currentTime(seconds);
        playerRef.current?.play();
      },
    }));

    useEffect(() => {
      if (!videoRef.current || playerRef.current) return;

      const videoElement = document.createElement("video-js");
      videoElement.classList.add("vjs-big-play-centered");
      videoRef.current.appendChild(videoElement);

      const player = videojs(videoElement, {
        controls: true,
        fluid: true,
        preload: "metadata",
        sources: [{ src }],
      });
      playerRef.current = player;

      return () => {
        player.dispose();
        playerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      playerRef.current?.src({ src });
    }, [src]);

    return (
      <div data-vjs-player className={className}>
        <div ref={videoRef} />
      </div>
    );
  }
);
