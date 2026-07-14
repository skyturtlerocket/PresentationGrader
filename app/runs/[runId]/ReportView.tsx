"use client";

import { useRef } from "react";
import { VideoPlayer, type VideoPlayerHandle } from "@/app/components/VideoPlayer";
import type { EvidenceItem } from "@/lib/judge/schema";

type CriterionDisplay = {
  criterionId: string;
  name: string;
  score: number;
  max: number;
  low: number;
  high: number;
  evidence: EvidenceItem[];
};

type Props = {
  videoUrl: string;
  durationMs: number;
  overallLow: number;
  overallHigh: number;
  criteria: CriterionDisplay[];
};

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReportView({ videoUrl, durationMs, overallLow, overallHigh, criteria }: Props) {
  const playerRef = useRef<VideoPlayerHandle>(null);

  function jumpTo(startMs: number) {
    playerRef.current?.seekTo(startMs / 1000);
  }

  const allEvidence = criteria.flatMap((c) =>
    c.evidence.map((e) => ({ ...e, criterionName: c.name }))
  );

  return (
    <div className="flex flex-col gap-6">
      <VideoPlayer ref={playerRef} src={videoUrl} />

      {/* Scrubber markers — one tick per evidence item, clickable to seek */}
      {durationMs > 0 && allEvidence.length > 0 && (
        <div className="relative h-4 w-full rounded bg-gray-100">
          {allEvidence.map((e, i) => (
            <button
              key={i}
              title={`${e.criterionName}: ${e.observation}`}
              onClick={() => jumpTo(e.start_ms)}
              className="absolute top-0 h-4 w-1.5 -translate-x-1/2 rounded bg-gray-500 hover:bg-black"
              style={{ left: `${Math.min(100, (e.start_ms / durationMs) * 100)}%` }}
            />
          ))}
        </div>
      )}

      {/* De-emphasized score range — the moments below are the actual value */}
      <div className="text-sm text-gray-400">
        Overall range: {Math.round(overallLow)}–{Math.round(overallHigh)}
        <span className="ml-2">
          (a single AI pass is noisy — this is the spread across 3 independent judge runs, not a
          precise score)
        </span>
      </div>

      <section className="flex flex-col gap-8">
        <h2 className="text-lg font-semibold">What we noticed</h2>
        {criteria.map((c) => (
          <div key={c.criterionId}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-medium">{c.name}</h3>
              <span className="text-sm text-gray-400">
                {c.low === c.high ? c.low : `${c.low}–${c.high}`} / {c.max}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {c.evidence.map((e, i) => (
                <li key={i}>
                  <button
                    onClick={() => jumpTo(e.start_ms)}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-left hover:border-black"
                  >
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>
                        {formatTimestamp(e.start_ms)}–{formatTimestamp(e.end_ms)}
                      </span>
                      <span className="underline">Jump to moment</span>
                    </div>
                    <p className="mt-1 text-sm italic text-gray-700">&ldquo;{e.transcript_span}&rdquo;</p>
                    <p className="mt-1 text-sm">{e.observation}</p>
                    <p className="mt-1 text-xs text-gray-500">{e.why}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
