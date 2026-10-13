#!/usr/bin/env bash
# Scenes stage of .github/workflows/render.yml. Runs after the voice stage, in its own job,
# because the two dependency groups conflict.
# Reads EPISODE, ONLY, MODELS, ALLOW_DRAFT, LABEL, BEFORE, RUNNER_TEMP and GITHUB_SHA from the
# environment, and INTRO_SOUND if the workflow fetched one (the logo's sound; without it the
# intro is silent). Takes the narration from the draft Release ep-<id> and puts the previews
# back there; nothing rendered is printed or stored anywhere else.
set -euo pipefail

[[ "${LABEL:-}" =~ ^[a-z0-9-]{0,24}$ ]] || { echo "refusing odd label: ${LABEL:-}" >&2; exit 1; }
suffix="${LABEL:+-$LABEL}"
[[ "$ONLY" =~ ^(all|long|short-[0-9]+)$ ]] || { echo "refusing odd target: $ONLY" >&2; exit 1; }

# Tuning runs render several voices to compare them; scenes are drawn for one voice.
read -r -a models <<< "${MODELS:-}"
if [ "${#models[@]}" -gt 1 ]; then
  echo "several voice models were rendered; scenes are skipped for a voice comparison"
  exit 0
fi
model="${models[0]:-$(uv run --no-sync python -c \
  'import yaml; print(yaml.safe_load(open("config/voice.yaml", encoding="utf-8"))["model"])')}"
[[ "$model" =~ ^(original|turbo)$ ]] || { echo "refusing odd model: $model" >&2; exit 1; }

if [ -n "${EPISODE:-}" ]; then
  episodes="$EPISODE"
else
  episodes=$(git diff --name-only "$BEFORE" "$GITHUB_SHA" -- 'content/episodes/*/episode.yaml' \
    | cut -d/ -f3 | sort -u)
fi

for ep in $episodes; do
  [[ "$ep" =~ ^[0-9]{3}-[a-z0-9-]+$ ]] || { echo "refusing odd episode id: $ep" >&2; exit 1; }
  tag="ep-$ep"
  out="out/$ep"
  upload="$RUNNER_TEMP/upload-$ep"
  archive="voice.$ONLY.$model$suffix.zip"
  rm -rf "$out" "$upload"
  mkdir -p "$out" "$upload"

  # No narration means the voice stage skipped this episode (a draft, say): nothing to draw.
  if ! gh release download "$tag" --pattern "$archive" --dir "$RUNNER_TEMP" --clobber \
    2>/dev/null; then
    echo "no narration for $ep ($archive); scenes skipped"
    continue
  fi
  unzip -q -o "$RUNNER_TEMP/$archive" -d "$out"

  # Three scenes at a time: the runner has four cores, and each scene is its own process
  # with its own browser.
  args=(--episode "$ep" --stage scenes --only "$ONLY" --out "$out" --jobs 3)
  if [ "${ALLOW_DRAFT:-false}" = "true" ]; then args+=(--allow-draft); fi
  if [ -n "${INTRO_SOUND:-}" ] && [ -f "$INTRO_SOUND" ]; then
    args+=(--intro-sound "$INTRO_SOUND")
  fi
  uv run --no-sync python -m channel_os.render "${args[@]}" | tee "$RUNNER_TEMP/scenes.log"
  [ -d "$out/preview" ] || continue

  for file in "$out"/preview/*.mp4; do
    cp "$file" "$upload/preview.$(basename "$file" .mp4)$suffix.mp4"
  done
  {
    echo "### $ep, scenes"
    echo
    echo "| target | frames | seconds | scenes | format | theme |"
    echo "|---|---|---|---|---|---|"
    sed -n -E \
      's/^([a-z0-9-]+): ([0-9]+) frames \(([0-9.]+) s\), ([0-9]+) scene\(s\), ([a-z]+), theme ([a-z]+) .*/| \1 | \2 | \3 | \4 | \5 | \6 |/p' \
      "$RUNNER_TEMP/scenes.log"
    echo
  } >> "$GITHUB_STEP_SUMMARY"
  gh release upload "$tag" "$upload"/* --clobber
done
