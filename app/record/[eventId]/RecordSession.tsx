"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SETUP_SECONDS = 180;

type Phase =
  | "intro"
  | "setup"
  | "recording"
  | "uploading"
  | "error";

type Props = {
  eventSlug: string;
  eventName: string;
  timeLimitMs: number;
};

/** Picks the best MediaRecorder mime type this browser actually supports. */
function pickRecorderMimeType(): { mimeType: string; contentType: string; ext: string } {
  const candidates: Array<{ mimeType: string; contentType: string; ext: string }> = [
    { mimeType: "video/mp4;codecs=avc1,mp4a", contentType: "video/mp4", ext: "mp4" },
    { mimeType: "video/mp4", contentType: "video/mp4", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", contentType: "video/webm", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", contentType: "video/webm", ext: "webm" },
    { mimeType: "video/webm", contentType: "video/webm", ext: "webm" },
  ];

  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  // Fall back to letting the browser choose; contentType/ext are best guesses.
  return { mimeType: "", contentType: "video/webm", ext: "webm" };
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordSession({ eventSlug, eventName, timeLimitMs }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [setupSecondsLeft, setSetupSecondsLeft] = useState(SETUP_SECONDS);
  const [recordSecondsLeft, setRecordSecondsLeft] = useState(Math.floor(timeLimitMs / 1000));
  const [uploadProgress, setUploadProgress] = useState(0);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const runIdRef = useRef<string | null>(null);
  const recordedFormatRef = useRef<{ contentType: string; ext: string } | null>(null);
  const recordStartedAtRef = useRef<number>(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const uploadBlob = useCallback(
    async (blob: Blob, durationMs: number, contentType: string) => {
      const runId = runIdRef.current;
      if (!runId) throw new Error("Missing run id");

      setPhase("uploading");

      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, contentType }),
      });
      if (!signRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, key } = await signRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(blob);
      });

      const finalizeRes = await fetch(`/api/runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoKey: key, durationMs }),
      });
      if (!finalizeRes.ok) throw new Error("Failed to finalize run");

      router.push(`/runs/${runId}`);
    },
    [router]
  );

  async function createRun() {
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventSlug }),
    });
    if (!res.ok) throw new Error("Failed to start run");
    const { runId } = await res.json();
    runIdRef.current = runId;
    return runId;
  }

  async function startSetup() {
    try {
      setError(null);
      await createRun();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        await videoPreviewRef.current.play().catch(() => {});
      }
      setPhase("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera/microphone");
      setPhase("error");
    }
  }

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      setError("Camera stream was lost — please restart.");
      setPhase("error");
      return;
    }

    const { mimeType, contentType, ext } = pickRecorderMimeType();
    recordedFormatRef.current = { contentType, ext };
    chunksRef.current = [];

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - recordStartedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: recordedFormatRef.current!.contentType });
      stopStream();
      uploadBlob(blob, durationMs, recordedFormatRef.current!.contentType).catch((err) => {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPhase("error");
      });
    };

    recorder.start(1000); // 1s timeslice — chunks buffer client-side as the take happens
    recorderRef.current = recorder;
    recordStartedAtRef.current = Date.now();
    setRecordSecondsLeft(Math.floor(timeLimitMs / 1000));
    setPhase("recording");
  }, [stopStream, timeLimitMs, uploadBlob]);

  function endRecordingEarly() {
    recorderRef.current?.stop();
  }

  // Setup countdown -> auto-transition into recording
  useEffect(() => {
    if (phase !== "setup") return;
    if (setupSecondsLeft <= 0) {
      beginRecording();
      return;
    }
    const t = setTimeout(() => setSetupSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, setupSecondsLeft, beginRecording]);

  // Recording countdown -> hard auto-stop at the time limit
  useEffect(() => {
    if (phase !== "recording") return;
    if (recordSecondsLeft <= 0) {
      recorderRef.current?.stop();
      return;
    }
    const t = setTimeout(() => setRecordSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, recordSecondsLeft]);

  async function handleFileUpload(file: File) {
    try {
      setError(null);
      setPhase("uploading");
      await createRun();
      // Duration isn't known until the browser decodes metadata.
      const durationMs = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(Math.round(v.duration * 1000));
        v.src = URL.createObjectURL(file);
      });
      await uploadBlob(file, durationMs, file.type || "video/mp4");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">{eventName}</h1>
        <p className="text-sm text-gray-500">
          Time limit: {Math.round(timeLimitMs / 60000)} minutes
        </p>
      </div>

      {phase === "intro" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            You&apos;ll get {SETUP_SECONDS / 60} minutes to set up, then recording starts
            automatically with a hard countdown. There&apos;s no pause and no retakes on this
            run — this mirrors the pressure of a real judge round.
          </p>
          <button
            onClick={startSetup}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Start setup
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200" />
            or
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <label className="cursor-pointer rounded border px-4 py-2 text-center text-sm font-medium">
            Upload a recording instead
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {(phase === "setup" || phase === "recording") && (
        <div className="flex flex-col gap-4">
          <video
            ref={videoPreviewRef}
            muted
            playsInline
            className="w-full rounded bg-black"
          />
          {phase === "setup" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Setup — recording starts in {formatTime(setupSecondsLeft)}
              </span>
              <button
                onClick={beginRecording}
                className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
              >
                Start now
              </button>
            </div>
          )}
          {phase === "recording" && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-600">
                ● Recording — {formatTime(recordSecondsLeft)} remaining
              </span>
              <button
                onClick={endRecordingEarly}
                className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-600"
              >
                End presentation
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "uploading" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-600">Uploading your recording…</p>
          <div className="h-2 w-full rounded bg-gray-100">
            <div
              className="h-2 rounded bg-black transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => setPhase("intro")}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
