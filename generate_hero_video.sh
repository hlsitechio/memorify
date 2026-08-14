#!/usr/bin/env bash
# Generate hero background video - just solid color loop
ffmpeg -f lavfi -i "color=c=0x080A0F:size=1280x720:d=10" \
  -c:v libx264 -pix_fmt yuv420p -t 10 -r 25 -preset fast "G:/memorify/public/brand/hero-bg.mp4" -y