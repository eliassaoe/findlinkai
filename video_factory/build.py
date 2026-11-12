#!/usr/bin/env python3
"""Build one tutorial video from a scenario, end to end, with no human step.

    python3 video_factory/build.py video_factory/scenarios/<slug>.json out/<slug>
        [--fake-tts]   # no network: silent audio sized from word count (local tests)

Steps: narration (edge-tts) -> recording of the real app (render.mjs) ->
cover/closing cards (cards.mjs) -> ffmpeg assembly -> out/<slug>/<slug>.mp4
plus out/<slug>/meta.json (title, description, tags) for the uploader.
See video_factory/README.md.
"""
import asyncio, json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VOICE = os.environ.get("LF_VOICE", "en-US-AndrewNeural")
RATE = os.environ.get("LF_RATE", "+0%")


def run(cmd):
    print("+", " ".join(map(str, cmd))[:200], flush=True)
    subprocess.run(list(map(str, cmd)), check=True)


def dur(f):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(f)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def lines(sc):
    out = [("cover", sc["cover"]), ("payoff", sc["payoff"])]
    out += [(s["id"], s["narration"]) for s in sc["steps"]]
    out.append(("outro", sc["outro"]))
    return out


VOICES = [VOICE, "en-US-ChristopherNeural", "en-US-GuyNeural", "en-US-AndrewMultilingualNeural"]
PIPER_VOICE = os.environ.get("LF_PIPER_VOICE", "en_US-ryan-high")


async def edge_one(text, f):
    import edge_tts
    last = None
    for v in VOICES:
        for _ in range(2):
            try:
                await edge_tts.Communicate(text, v, rate=RATE).save(str(f))
                if f.exists() and f.stat().st_size > 1000:
                    return v
            except Exception as e:  # NoAudioReceived, 403, network
                last = e
            await asyncio.sleep(2)
    raise RuntimeError(f"edge-tts failed: {last}")


def piper_one(text, f):
    """Offline neural TTS fallback (runner downloads the voice once)."""
    vdir = Path(os.environ.get("LF_PIPER_DIR", Path.home() / ".piper"))
    model = vdir / f"{PIPER_VOICE}.onnx"
    if not model.exists():
        vdir.mkdir(parents=True, exist_ok=True)
        lang, name, q = PIPER_VOICE.split("-")
        base = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/en/{lang}/{name}/{q}/{PIPER_VOICE}"
        run(["curl", "-sSL", "-o", model, base + ".onnx"])
        run(["curl", "-sSL", "-o", str(model) + ".json", base + ".onnx.json"])
    wav = f.with_suffix(".wav")
    subprocess.run(["piper", "--model", str(model), "--output_file", str(wav), "--sentence_silence", "0.25"],
                   input=text, text=True, check=True)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame", "-q:a", "3", f])
    wav.unlink()


async def tts_all(items, adir):
    engine = os.environ.get("LF_TTS", "edge")
    used = set()
    for key, text in items:
        f = adir / f"{key}.mp3"
        if f.exists():
            continue
        if engine == "edge":
            try:
                used.add(await edge_one(text, f))
                continue
            except Exception as e:
                print("edge-tts unavailable, switching to piper:", e, flush=True)
                os.environ["LF_TTS"] = "piper"
                for g in adir.glob("*.mp3"):  # one voice for the whole video
                    g.unlink()
                return await tts_all(items, adir)
        piper_one(text, f)
    print("voices:", used or {PIPER_VOICE}, flush=True)


def fake_tts(items, adir):
    for key, text in items:
        f = adir / f"{key}.mp3"
        secs = max(1.2, len(text.split()) / 2.6)
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
             "-t", f"{secs:.2f}", "-c:a", "libmp3lame", f])


def main():
    scen, out = Path(sys.argv[1]), Path(sys.argv[2])
    fake = "--fake-tts" in sys.argv
    sc = json.loads(scen.read_text())
    out.mkdir(parents=True, exist_ok=True)
    adir = out / "audio"; adir.mkdir(exist_ok=True)
    items = lines(sc)
    fake_tts(items, adir) if fake else asyncio.run(tts_all(items, adir))
    durations = {k: dur(adir / f"{k}.mp3") for k, _ in items}
    (out / "durations.json").write_text(json.dumps(durations, indent=1))

    run(["node", HERE / "render.mjs", scen, out / "durations.json", out])
    run(["node", HERE / "cards.mjs", scen, out])
    tl = json.loads((out / "timeline.json").read_text())

    fps = "30"
    enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", fps]
    aenc = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]

    def still(img, audio, seconds, dst, zoom=False):
        vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white"
        if zoom:  # slow push-in on the finished result
            frames = int(float(seconds) * 30)
            vf = ("scale=3840:-1,zoompan=z='min(1+0.0006*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                  f":d={frames}:s=1920x1080:fps=30")
        run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", img, "-i", audio,
             "-vf", vf, "-t", f"{seconds:.2f}", *enc, *aenc, "-af", "apad", "-shortest", dst])

    segs = []
    still(out / "cover.png", adir / "cover.mp3", durations["cover"] + 0.7, out / "s0.mp4"); segs.append(out / "s0.mp4")
    still(out / "payoff.jpg", adir / "payoff.mp3", durations["payoff"] + 0.6, out / "s1.mp4", zoom=True); segs.append(out / "s1.mp4")

    # main recording, narration of each step placed at the step's start
    inputs, filt = [], []
    for i, s in enumerate(tl["steps"]):
        inputs += ["-i", adir / f"{s['id']}.mp3"]
        ms = int(s["start"] * 1000) + 150
        filt.append(f"[{i+1}:a]adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(tl["steps"])))
    filt.append(f"{mix}amix=inputs={len(tl['steps'])}:normalize=0,apad[aout]")
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", out / "frames.ffconcat", *inputs,
         "-filter_complex", ";".join(filt), "-map", "0:v", "-map", "[aout]",
         "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white",
         "-t", f"{tl['total']:.2f}", *enc, *aenc, out / "s2.mp4"]); segs.append(out / "s2.mp4")

    still(out / "outro.png", adir / "outro.mp3", durations["outro"] + 1.5, out / "s3.mp4"); segs.append(out / "s3.mp4")

    lst = out / "segs.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in segs))
    final = out / f"{sc['slug']}.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
         "-c", "copy", "-movflags", "+faststart", final])
    meta = {k: sc[k] for k in ("slug", "title", "description", "tags") if k in sc}
    meta["duration"] = dur(final)
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print("OK", final, f"{meta['duration']:.1f}s")


if __name__ == "__main__":
    main()
