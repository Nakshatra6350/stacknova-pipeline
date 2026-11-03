#!/bin/bash
# Makes the real pieces the player tests use: 1 minute of a busy test film
# (ffmpeg's own Mandelbrot zoom), at five qualities, cut into 4-second pieces.
# Then the same quality setting on a calm film (one of our own videos), to
# show why one ladder doesn't suit every film.
#
#   bash encode.sh OUT_DIR CALM_VIDEO
set -euo pipefail
out=${1:?out dir}
calm=${2:?a calm video to compare}
mkdir -p "$out"
ffmpeg -y -loglevel error -f lavfi -i "mandelbrot=s=1920x1080:rate=30" \
  -t 60 -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 18 "$out/source.mp4"
ls -la "$out/source.mp4"

encode() { # name width height kbps
  mkdir -p "$out/$1"
  ffmpeg -y -loglevel error -i "$out/source.mp4" -vf "scale=$2:$3" \
    -c:v libx264 -preset veryfast -b:v "$4k" -maxrate "$(( $4 * 3 / 2 ))k" \
    -bufsize "$(( $4 * 2 ))k" -g 120 -keyint_min 120 -sc_threshold 0 \
    -f segment -segment_time 4 -segment_format mpegts "$out/$1/piece-%03d.ts"
}
encode 270p 480 270 300
encode 360p 640 360 750
encode 540p 960 540 1500
encode 720p 1280 720 3000
encode 1080p 1920 1080 5800

# the same quality setting (CRF 23) on a busy film and a calm one
rate() { ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$1"; }
ffmpeg -y -loglevel error -i "$out/source.mp4" -t 60 -vf scale=1080:-2 -c:v libx264 -preset veryfast -crf 23 -an "$out/busy-crf23.mp4"
ffmpeg -y -loglevel error -i "$calm" -t 60 -vf scale=1080:-2 -c:v libx264 -preset veryfast -crf 23 -an "$out/calm-crf23.mp4"
{
  echo "same setting (CRF 23), 1080 wide, 60 s:"
  echo "  busy test film: $(( $(rate "$out/busy-crf23.mp4") / 1000 )) kbps"
  echo "  calm film (one of our own videos): $(( $(rate "$out/calm-crf23.mp4") / 1000 )) kbps"
} > "$out/content.txt"
rm "$out/source.mp4" "$out/busy-crf23.mp4" "$out/calm-crf23.mp4"
cat "$out/content.txt"
du -sh "$out"
