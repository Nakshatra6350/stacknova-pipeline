r"""Light edits on a released Short and Reel, without drawing them again (22 Oct 2026 plan).

    .venv\Scripts\python.exe studio/scripts/polish.py ID TIMELINE.json [HEAD.mp4]

Reads out/release/<ID>-short.mp4 and -reel.mp4 and writes out/release/v2/ with:
- the Short ending on its last word, so YouTube plays it again from the hook (a loop counts as
  a full view; the end card was where viewers swiped away);
- the Reel keeping only LINGER seconds of its "Follow for ..." card;
- with HEAD.mp4 (a silent part drawn by render.py from frame 0), its frames in place of the
  first ones: a new opening, the rest of the video untouched.
"""

import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import ENCODE, FPS, ffmpeg  # noqa: E402

LINGER = 1.4  # seconds of the Reel's end card that stay
GIFT_LINGER = 2.6  # a Reel offering a free pack: long enough to read its keyword
FADE = 0.15  # the sound fades out over the last seconds of a cut


def frames(path: Path) -> int:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
         "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return int(out.strip())


def cut(src: Path, out: Path, seconds: float, head: Path | None) -> None:
    """The first `seconds` of src, with head's frames (if any) in place of its first frames."""
    last = round(seconds * FPS)
    if head:
        n = frames(head)
        video = (f"[1:v]trim=start_frame={n}:end_frame={last},setpts=PTS-STARTPTS[b];"
                 "[0:v][b]concat=n=2:v=1:a=0[v]")
        inputs = ["-i", str(head), "-i", str(src)]
        audio = f"[1:a]atrim=0:{last / FPS},afade=t=out:st={last / FPS - FADE}:d={FADE}[a]"
    else:
        video = f"[0:v]trim=end_frame={last},setpts=PTS-STARTPTS[v]"
        inputs = ["-i", str(src)]
        audio = f"[0:a]atrim=0:{last / FPS},afade=t=out:st={last / FPS - FADE}:d={FADE}[a]"
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", *inputs,
         "-filter_complex", f"{video};{audio}", "-map", "[v]", "-map", "[a]", *ENCODE,
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)],
        check=True,
    )
    assert frames(out) == last, f"{out.name} has {frames(out)} frames, not {last}"


def main(film_id: str, timeline: Path, head: Path | None) -> None:
    tl = yaml.safe_load(timeline.read_text(encoding="utf-8-sig"))
    end = float(tl["events"]["end"])
    linger = GIFT_LINGER if tl.get("film", {}).get("gift") else LINGER
    release = ROOT / "out" / "release"
    cut(release / f"{film_id}-short.mp4", release / "v2" / f"{film_id}-short.mp4", end, head)
    cut(release / f"{film_id}-reel.mp4", release / "v2" / f"{film_id}-reel.mp4", end + linger, head)
    print(f"{film_id}: Short ends at {end:.2f} s, Reel at {end + linger:.2f} s"
          + (f", opening from {head.name}" if head else ""))


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]) if len(sys.argv) > 3 else None)
