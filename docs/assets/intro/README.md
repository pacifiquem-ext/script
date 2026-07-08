# script intro video (Hyperframes)

Programmatic explainer for the **script** monorepo, produced with the project
[`.agents/skills/video`](../../../.agents/skills/video/SKILL.md) pipeline:

- **Hyperframes** — HTML composition, sharp text, no Ken Burns / continuous zoom
- **Kokoro TTS** (`hyperframes tts`) — Michael voice narration
- Soft **opacity-only** scene transitions (text stays fixed)

## Re-render

```bash
# Node >= 22, ffmpeg, Chrome
npm i -g hyperframes   # or npx
pip install kokoro-onnx soundfile   # first-time TTS

cd docs/assets/intro
# optional: regenerate speech
# hyperframes tts -v am_michael -o audio/s1.wav audio/s1.txt

npx hyperframes render . -o ../script-intro.mp4 -q high -f 30
ffmpeg -y -ss 2 -i ../script-intro.mp4 -frames:v 1 -q:v 2 ../script-intro-poster.png
```

## Layout

| Path | Purpose |
| ---- | ------- |
| `index.html` | Composition (6 scenes + audio clips) |
| `audio/sN.wav` | Scene narration |
| `audio/sN.txt` | Narration script |
| `timeline.json` | Computed start/duration map |
