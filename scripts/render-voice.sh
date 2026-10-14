#!/usr/bin/env bash
# Voice stage of .github/workflows/render.yml.
# Reads EPISODE, ONLY, MODELS, ALLOW_DRAFT, SETTINGS, LABEL, BEFORE, RUNNER_TEMP and GITHUB_SHA
# from the environment. Renders go only into the draft Release ep-<id>; nothing audible is printed.
set -euo pipefail

reference="$RUNNER_TEMP/reference.wav"
upload="$RUNNER_TEMP/upload"

# Tuning runs: SETTINGS holds KEY=VALUE overrides, LABEL keeps their output files apart.
overrides=()
for pair in ${SETTINGS:-}; do
  [[ "$pair" =~ ^[a-z_.]+=[A-Za-z0-9.+-]+$ ]] || { echo "refusing odd setting: $pair" >&2; exit 1; }
  overrides+=(--set "$pair")
done
[[ "${LABEL:-}" =~ ^[a-z0-9-]{0,24}$ ]] || { echo "refusing odd label: ${LABEL:-}" >&2; exit 1; }
suffix="${LABEL:+-$LABEL}"

if [ -n "${EPISODE:-}" ]; then
  episodes="$EPISODE"
else
  episodes=$(git diff --name-only "$BEFORE" "$GITHUB_SHA" -- 'content/episodes/*/episode.yaml' \
    | cut -d/ -f3 | sort -u)
fi

[[ "$ONLY" =~ ^(all|long|short-[0-9]+)$ ]] || { echo "refusing odd target: $ONLY" >&2; exit 1; }

# The cache holds every reading of every chunk and what was heard in it. It is saved even
# when the render fails, so a run that stops on one sentence does not cost all its speech.
saved=1
save_cache() {
  if [ "$saved" = 0 ]; then
    saved=1
    tar -cf "$RUNNER_TEMP/voice-cache.tar" -C .cache/voice . \
      && gh release upload "$tag" "$RUNNER_TEMP/voice-cache.tar" --clobber \
      || echo "could not save the voice cache" >&2
  fi
}
trap save_cache EXIT

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
  saved=0

  for model in ${MODELS:-default}; do
    [[ "$model" =~ ^(default|original|turbo)$ ]] \
      || { echo "refusing odd model: $model" >&2; exit 1; }
    out="out/$ep/$model$suffix"
    args=(--episode "$ep" --only "$ONLY" --reference "$reference" --out "$out")
    if [ "$model" != "default" ]; then args+=(--model "$model"); fi
    if [ "${ALLOW_DRAFT:-false}" = "true" ]; then args+=(--allow-draft); fi
    uv run --no-sync python -m channel_os.render "${args[@]}" "${overrides[@]}"
    [ -f "$out/timing.json" ] || continue

    name="$(jq -r '.targets | to_entries[0].value.model' "$out/timing.json")$suffix"
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
      # What the listening check did: chunks read again, and places it could not confirm.
      echo "| target | listened to | chunks read again | places not confirmed |"
      echo "|---|---|---|---|"
      jq -r '.targets | to_entries[] | "| \(.key) | \(.value.listened // false) | \([.value.segments[] | .retakes // 0] | add) | \([.value.segments[] | (.unsure // []) | length] | add) |"' \
        "$out/timing.json"
      echo
      jq -r '.targets | to_entries[] | .key as $t | .value.segments[] | .id as $s | (.unsure // [])[] | "- \($t) \($s): meant \"\(.meant)\", heard \"\(.heard)\""' \
        "$out/timing.json"
      echo
    } >> "$GITHUB_STEP_SUMMARY"
  done

  save_cache
  # An episode the render skipped (a draft pushed to main, say) leaves nothing to upload.
  if compgen -G "$upload/*" > /dev/null; then
    gh release upload "$tag" "$upload"/* --clobber
  else
    echo "nothing rendered for $ep"
  fi
done
