"""
Modal media worker for the presentation grader.

Deployed separately from the Next.js app (`modal deploy modal/worker.py`).
Exposes a single HTTP endpoint that computes the audio-signal metrics that
genuinely need decoded audio samples: pitch variance (Praat, via parselmouth)
and volume consistency (RMS energy, via librosa). Everything else (WPM,
pauses, fillers, time compliance) is derived from the Deepgram transcript in
plain TypeScript -- see lib/metrics/deterministic.ts -- so this worker stays
narrowly scoped to the one job Python signal-processing libraries are
actually needed for.
"""

import subprocess
import tempfile
from pathlib import Path

import modal

app = modal.App("presentation-grader-worker")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi[standard]", "requests", "numpy", "librosa", "praat-parselmouth")
)


def download_video(video_url: str, dest: Path) -> None:
    import requests

    with requests.get(video_url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)


def extract_mono_wav(video_path: Path, wav_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            str(wav_path),
        ],
        check=True,
        capture_output=True,
    )


def compute_pitch_variance_hz(wav_path: Path) -> float:
    import parselmouth
    import numpy as np

    sound = parselmouth.Sound(str(wav_path))
    pitch = sound.to_pitch()
    values = pitch.selected_array["frequency"]
    voiced = values[values > 0]  # drop unvoiced/silent frames
    if voiced.size < 2:
        return 0.0
    return float(np.std(voiced))


def compute_volume_consistency(wav_path: Path) -> float:
    import librosa
    import numpy as np

    y, sr = librosa.load(str(wav_path), sr=None, mono=True)
    rms = librosa.feature.rms(y=y)[0]
    voiced_rms = rms[rms > np.percentile(rms, 5)]  # drop near-silent frames
    if voiced_rms.size < 2 or np.mean(voiced_rms) == 0:
        return 0.0
    coefficient_of_variation = float(np.std(voiced_rms) / np.mean(voiced_rms))
    # Map CoV to a 0-1 "consistency" score -- lower variation is more
    # consistent. CoV of ~1.0+ is very erratic; clamp to keep the score sane.
    return max(0.0, 1.0 - min(coefficient_of_variation, 1.0))


@app.function(image=image, timeout=300)
@modal.fastapi_endpoint(method="POST")
def audio_metrics(item: dict):
    video_url = item["video_url"]

    with tempfile.TemporaryDirectory() as tmp:
        video_path = Path(tmp) / "input.mp4"
        wav_path = Path(tmp) / "audio.wav"

        download_video(video_url, video_path)
        extract_mono_wav(video_path, wav_path)

        return {
            "pitch_variance_hz": compute_pitch_variance_hz(wav_path),
            "volume_consistency": compute_volume_consistency(wav_path),
        }
