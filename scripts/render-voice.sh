#!/usr/bin/env bash
# Voice stage of .github/workflows/render.yml.
# Reads EPISODE, ONLY, MODELS, ALLOW_DRAFT, BEFORE, RUNNER_TEMP and GITHUB_SHA from the
# environment. Renders go only into the draft Release ep-<id>; nothing audible is printed.
set -euo pipefail

reference="$RUNNER_TEMP/reference.wav"
upload="$RUNNER_TEMP/upload"

if [ -n "${EPISODE:-}" ]; then
  episodes="$EPISODE"
else
  episodes=$(git diff --name-only "$BEFORE" "$GITHUB_SHA" -- 'content/episodes/*/episode.yaml' \
    | cut -d/ -f3 | sort -u)
fi

[[ "$ONLY" =~ ^(all|long|short-[0-9]+)$ ]] || { echo "refusing odd target: $ONLY" >&2; exit 1; }

for ep in $episodes; do
  [[ "$ep" =~ ^[0-9]{3}-[a-z0-9-]+$ ]] || { echo "refusing odd episode id: $ep" >&2; exit 1; }
  tag="ep-$ep"
  rm -rf "$upload" .cache/voice
  mkdir -p "$upload" .cache/voice

  if gh release view "$tag" >/dev/null 2>&1; then
    if gh release download "$tag" --pattern voice-cache.tar --dir "$RUNNER_TEMP" --clobber \
      2>/dev/null; then
      tar -xf "$RUNNER_TEMP/voice-cache.tar" -C .cache/voice
    fi
  else
    gh release create "$tag" --draft --title "Episode $ep renders" \
      --notes "Private render storage for the pipeline. This Release stays a draft."
  fi

  for model in ${MODELS:-default}; do
    [[ "$model" =~ ^(default|original|turbo)$ ]] \
      || { echo "refusing odd model: $model" >&2; exit 1; }
    out="out/$ep/$model"
    args=(--episode "$ep" --only "$ONLY" --reference "$reference" --out "$out")
    if [ "$model" != "default" ]; then args+=(--model "$model"); fi
    if [ "${ALLOW_DRAFT:-false}" = "true" ]; then args+=(--allow-draft); fi
    uv run --no-sync python -m channel_os.render "${args[@]}"
    [ -f "$out/timing.json" ] || continue

    name=$(jq -r '.targets | to_entries[0].value.model' "$out/timing.json")
    for dir in "$out"/voice/*/; do
      cp "$dir/narration.wav" "$upload/$(basename "$dir").$name.narration.wav"
    done
    (cd "$out" && zip -qr "$upload/voice.$ONLY.$name.zip" .)
    {
      echo "### $ep, model $name"
      echo
      echo "| target | seconds | LUFS | dBTP | segments |"
      echo "|---|---|---|---|---|"
      jq -r '.targets | to_entries[] | "| \(.key) | \(.value.duration) | \(.value.loudness.integrated_lufs) | \(.value.loudness.true_peak_db) | \(.value.segments | length) |"' \
        "$out/timing.json"
      echo
    } >> "$GITHUB_STEP_SUMMARY"
  done

  tar -cf "$upload/voice-cache.tar" -C .cache/voice .
  gh release upload "$tag" "$upload"/* --clobber
done
