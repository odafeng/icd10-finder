#!/usr/bin/env bash
# Assemble the ICD-10 Finder demo from PNG cards (render_cards.py) + the S2
# browser recording. This ffmpeg lacks drawtext, so all text is pre-rendered to
# PNG and composited with overlay. 1920x1080 / 30fps / no audio.
set -euo pipefail
cd "$(dirname "$0")"

SRC="/Users/huangshifeng/Desktop/螢幕錄影 2026-06-14 中午12.02.39.mov"
BG="0x0d1117"
ENC=(-r 30 -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -an -movflags +faststart)
mkdir -p seg

# card <png> <out> <dur>  — still image → fading clip
card() {
  local png="$1" out="$2" dur="$3"
  local fo
  fo=$(awk "BEGIN{printf \"%.2f\", $dur-0.4}")
  ffmpeg -y -loglevel error -loop 1 -i "$png" -t "$dur" \
    -vf "fade=t=in:st=0:d=0.4,fade=t=out:st=$fo:d=0.4,setsar=1,format=yuv420p" \
    "${ENC[@]}" "$out"
}

echo "cards…"
card png/s1.png seg/s1.mp4 4.5
card png/s3.png seg/s3.mp4 7
card png/s4.png seg/s4.mp4 8
card png/s5.png seg/s5.mp4 8
card png/s6.png seg/s6.mp4 9
card png/s7.png seg/s7.mp4 4.5

echo "S2 browser clip + caption overlays…"
ffmpeg -y -loglevel error -i "$SRC" -i png/cap1.png -i png/cap2.png -filter_complex "
  [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG,fps=30,setsar=1[v];
  [v][1:v]overlay=enable='between(t,0.5,9)'[v1];
  [v1][2:v]overlay=enable='between(t,9,30)',format=yuv420p[vout]" \
  -map "[vout]" "${ENC[@]}" seg/s2.mp4

echo "concat…"
printf "file '%s.mp4'\n" s1 s2 s3 s4 s5 s6 s7 > seg/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i seg/list.txt -c copy ICD10_Finder_Demo.mp4 \
  || ffmpeg -y -loglevel error -f concat -safe 0 -i seg/list.txt "${ENC[@]}" ICD10_Finder_Demo.mp4

echo "DONE → $(pwd)/ICD10_Finder_Demo.mp4"
ffprobe -v error -show_entries format=duration -show_entries stream=width,height -of default=noprint_wrappers=1 ICD10_Finder_Demo.mp4
