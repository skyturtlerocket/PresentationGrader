export type TranscriptWord = {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  filler: boolean;
};

export type TranscriptionResult = {
  words: TranscriptWord[];
  fullText: string;
  providerMeta: Record<string, unknown>;
};

/**
 * Transcribes a video/audio file already reachable at `url` (e.g. an R2
 * presigned GET) using Deepgram Nova-3. Deepgram accepts most common video
 * containers directly — no separate audio-extraction step is needed for
 * transcription (only for the raw-signal metrics computed by the Modal
 * worker, which need decoded audio samples).
 */
export async function transcribeUrl(url: string): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set");

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    filler_words: "true",
    utterances: "false",
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`Deepgram transcription failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const channel = data?.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];

  if (!alt) {
    throw new Error("Deepgram response missing transcript alternatives");
  }

  const FILLER_WORDS = new Set(["um", "uh", "umm", "uhh", "hmm", "er", "ah"]);

  const words: TranscriptWord[] = (alt.words ?? []).map(
    (w: { word: string; start: number; end: number; confidence: number }) => ({
      word: w.word,
      start_ms: Math.round(w.start * 1000),
      end_ms: Math.round(w.end * 1000),
      confidence: w.confidence,
      filler: FILLER_WORDS.has(w.word.toLowerCase()),
    })
  );

  return {
    words,
    fullText: alt.transcript ?? "",
    providerMeta: { request_id: data?.metadata?.request_id, model: "nova-3" },
  };
}
