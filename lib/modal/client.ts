export type AudioSignalMetrics = {
  pitch_variance_hz: number;
  volume_consistency: number;
};

/**
 * Calls the deployed Modal worker (modal/worker.py) to compute the raw
 * audio-signal metrics that need actual decoded samples — pitch variance
 * (parselmouth/Praat) and volume consistency (librosa RMS). Everything
 * else (WPM, pauses, fillers, time compliance) is derived from the
 * Deepgram transcript in plain TypeScript — see lib/metrics/deterministic.ts.
 */
export async function computeAudioSignalMetrics(videoUrl: string): Promise<AudioSignalMetrics> {
  const workerUrl = process.env.MODAL_WORKER_URL;
  if (!workerUrl) throw new Error("MODAL_WORKER_URL is not set");

  const res = await fetch(`${workerUrl}/audio-metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl }),
  });

  if (!res.ok) {
    throw new Error(`Modal audio-metrics call failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}
