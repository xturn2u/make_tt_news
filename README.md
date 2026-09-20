# TikTok News Studio Local — MVP

Lokale macOS-Desktop-App im Make.com-Stil für einen reproduzierbaren News→Video-Workflow.

## Was im MVP real funktioniert

- visueller Node-Workflow mit frei verschiebbaren Nodes
- lokale LLM-Anbindung über Ollama (`/api/chat`)
- sicherer Fallback ohne LLM, wenn Ollama nicht läuft
- Bildsuche über Wikimedia Commons inkl. Lizenz-/Urheber-Metadaten
- lokale TTS über das eingebaute macOS `say`
- optionaler generischer Replicate-Node über `POST /v1/predictions`
- lokaler 9:16-MP4-Render (1080×1920) mit FFmpeg
- Finder-Export und Systemdiagnose
- Replicate-Token wird im MVP nicht gespeichert

## Voraussetzungen auf dem Mac

1. Node.js 22+
2. Rust stable + Xcode Command Line Tools
3. FFmpeg: `brew install ffmpeg`
4. Optional Ollama: `brew install ollama` oder Ollama-App; danach mindestens ein Modell laden, z. B. `ollama pull gemma3:4b`

## Start

```bash
npm install
npm run tauri:dev
```

## macOS-App bauen

```bash
npm install
npm run tauri:build
```

Das Bundle liegt danach unter `src-tauri/target/release/bundle/macos/`.

## Designentscheidung

Cloud-Funktionen sind optionale Nodes. Der Kern funktioniert lokal: Textverarbeitung (mit lokalem Ollama oder deterministischem Fallback), macOS-TTS und FFmpeg-Render. Die Medienquelle Wikimedia Commons liefert zusätzlich Lizenzinformationen; ein im Internet gefundenes Bild wird nicht allein durch Bearbeitung rechtefrei.

## Replicate

Der Node akzeptiert eine Modellkennung (`owner/model` bei offiziellen Modellen oder `owner/model:version`) und ein frei editierbares Input-JSON. Der Platzhalter `__IMAGE_URL__` wird vor dem Request durch das ausgewählte Wikimedia-Original ersetzt. Dadurch ist der Node nicht auf ein einzelnes Img2Video-Modell fest verdrahtet.
