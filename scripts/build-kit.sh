#!/usr/bin/env bash
# The upload kit of one episode (python -m channel_os.kit): subtitles, chapters, every text to
# paste, thumbnails and carousel slides, put into the episode's draft Release ep-<id> beside its
# videos. Run by .github/workflows/kit.yml, and by render-scenes.sh after a full render.
# Reads EPISODE and RUNNER_TEMP from the environment; MODEL is optional (config/voice.yaml).
# Uses the narration timing the voice stage left in the Release; renders nothing itself.
set -euo pipefail

ep="${EPISODE:-}"
[[ "$ep" =~ ^[0-9]{3}-[a-z0-9-]+$ ]] || { echo "refusing odd episode id: $ep" >&2; exit 1; }
model="${MODEL:-$(uv run --no-sync python -c \
  'import yaml; print(yaml.safe_load(open("config/voice.yaml", encoding="utf-8"))["model"])')}"
[[ "$model" =~ ^(original|turbo)$ ]] || { echo "refusing odd model: $model" >&2; exit 1; }

tag="ep-$ep"
out="out/$ep"
upload="$RUNNER_TEMP/kit-$ep"
rm -rf "$upload" "$out/kit"
mkdir -p "$out" "$upload"

if [ ! -f "$out/timing.json" ]; then
  archive="voice.all.$model.zip"
  if ! gh release download "$tag" --pattern "$archive" --dir "$RUNNER_TEMP" --clobber \
    2>/dev/null; then
    echo "no narration for $ep ($archive): render the voice first" >&2
    exit 1
  fi
  unzip -q -o "$RUNNER_TEMP/$archive" timing.json -d "$out"
fi

uv run --no-sync python -m channel_os.kit --episode "$ep" --out "$out" --images

cp "$out"/kit/*.srt "$out"/kit/*.jpg "$out"/kit/kit.md "$out"/kit/kit.json "$upload"/
(cd "$out/kit" && zip -q -r "$upload/kit.zip" . -x 'stills/*')
gh release upload "$tag" "$upload"/* --clobber
{
  echo "### $ep, upload kit"
  echo
  for file in "$upload"/*; do echo "- \`$(basename "$file")\`"; done
  echo
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
