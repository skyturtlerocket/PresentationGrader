import type { TranscriptWord } from "@/lib/deepgram/client";

const PAUSE_THRESHOLD_MS = 500; // gaps shorter than this are just natural speech rhythm

export type PauseSegment = { start_ms: number; end_ms: number; duration_ms: number };
export type FillerLocation = { word: string; start_ms: number; end_ms: number };
export type TimeCompliance = { limit_ms: number; actual_ms: number; within_limit: boolean };

/**
 * Everything here is computed directly from Deepgram word timestamps plus
 * known duration/time-limit — no LLM involved. This is the "never ask the
 * LLM to guess these" layer.
 */
export function computeTextTimingMetrics(
  words: TranscriptWord[],
  durationMs: number,
  timeLimitMs: number
) {
  const wpm = computeWpm(words, durationMs);
  const fillerLocations = computeFillerLocations(words);
  const pauseDistribution = computePauseDistribution(words, durationMs);
  const timeCompliance = computeTimeCompliance(durationMs, timeLimitMs);

  return {
    wpm,
    fillerCount: fillerLocations.length,
    fillerLocations,
    pauseDistribution,
    timeCompliance,
  };
}

function computeWpm(words: TranscriptWord[], durationMs: number): number {
  if (durationMs <= 0) return 0;
  const spokenWords = words.filter((w) => !w.filler);
  return Math.round((spokenWords.length / durationMs) * 60000 * 10) / 10;
}

function computeFillerLocations(words: TranscriptWord[]): FillerLocation[] {
  return words
    .filter((w) => w.filler)
    .map((w) => ({ word: w.word, start_ms: w.start_ms, end_ms: w.end_ms }));
}

function computePauseDistribution(words: TranscriptWord[], durationMs: number): PauseSegment[] {
  const pauses: PauseSegment[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    const gapStart = words[i].end_ms;
    const gapEnd = words[i + 1].start_ms;
    const gap = gapEnd - gapStart;
    if (gap >= PAUSE_THRESHOLD_MS) {
      pauses.push({ start_ms: gapStart, end_ms: gapEnd, duration_ms: gap });
    }
  }

  // Leading/trailing silence relative to the full clip duration.
  if (words.length > 0) {
    const leadGap = words[0].start_ms;
    if (leadGap >= PAUSE_THRESHOLD_MS) {
      pauses.unshift({ start_ms: 0, end_ms: leadGap, duration_ms: leadGap });
    }
    const lastWord = words[words.length - 1];
    const trailGap = durationMs - lastWord.end_ms;
    if (trailGap >= PAUSE_THRESHOLD_MS) {
      pauses.push({ start_ms: lastWord.end_ms, end_ms: durationMs, duration_ms: trailGap });
    }
  }

  return pauses;
}

function computeTimeCompliance(durationMs: number, timeLimitMs: number): TimeCompliance {
  return {
    limit_ms: timeLimitMs,
    actual_ms: durationMs,
    within_limit: durationMs <= timeLimitMs,
  };
}
