# Aluma

Ask a question about space and watch the answer unfold in 3D.

Aluma is a browser-based space explorer built around the Solar System. You type (or speak) something like *"how long does light take to reach Mars?"* or *"show me the wildfires happening right now"*, and the app turns that into a scene: a camera move, a model, a data panel, or a short spoken explanation.

## What it does

- **Solar System home view** with planets, dwarf planets and major moons, plus detailed models of spacecraft such as Voyager, Perseverance, the ISS and the James Webb Space Telescope.
- **Natural-language control.** A Gemini-backed router converts free-form questions into a small, validated JSON command. Anything it can't map safely falls back to a harmless default instead of breaking the screen.
- **Live data scenes**
  - Near-Earth asteroid swarm (NASA NeoWs)
  - Natural events on an Earth globe (NASA EONET)
  - Solar flare visualization
  - Mars orbital photos
- **Light-delay simulation**: a light beam travels Earth → Mars in real proportion.
- **Planet comparison** and pop-up info cards with facts and NASA/Wikipedia imagery.
- **Voice**: speech input where the browser supports it, spoken answers through ElevenLabs.
- **Student mode** with simpler wording, and a homework basket you can export as a PDF report.
- Works without voice or network access: static data and fallbacks keep the app usable.

## How it works

```
user input -> getRouteFromGemini() -> JSON -> handleActionRouter()
                                              |- 3D scene   (Three.js)
                                              |- 2D canvas  (procedural planets)
                                              |- data       (NASA, NOAA, JPL Horizons)
                                              `- text       (states.json)
```

No part skips a step: the UI only talks to the other modules through a few fixed function contracts, which keeps the pieces independent.

```
index.html          single entry page
server.js           local dev server + API endpoints
api/                serverless handlers (Vercel): route, tts, image proxies
src/ui/             router, HUD, popups, panels, voice, PDF export
src/services/       Gemini routing, intent guards, image and TTS helpers
src/three/          scene factory and all 3D scenes
src/physics/        light delay, solar position
src/canvas/         procedural planet renderer
src/api/            data layer and NASA/JPL clients
src/config/         scene flow and UI text (JSON)
public/models/      compressed .glb models
tests/              node:test suites
```

## Getting started

Requirements: Node.js 18+ and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/bunshiin/Aluma-space-ai.git
cd Aluma-space-ai
npm install
```

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_key
NASA_API_KEY=your_key            # optional, falls back to DEMO_KEY
ELEVENLABS_API_KEY=your_key      # optional, enables spoken answers
ELEVENLABS_VOICE_ID=your_voice   # optional
```

Start the server and open <http://127.0.0.1:5173>:

```bash
npm start
```

The page must be served over HTTP; opening `index.html` via `file://` won't load the models. API keys stay on the server and never reach the browser.

## Tests

```bash
npm test
```

Uses Node's built-in test runner; network and Gemini calls are mocked.

## Tech

Vanilla JavaScript (ES modules), Three.js, Google Gen AI SDK, ElevenLabs, html2pdf.js. No build step.

## Data sources

NASA NeoWs, EONET and image library, NOAA space weather, JPL Horizons, Wikipedia. 3D models are community-made assets; see [docs/models.md](docs/models.md) for the node trees and placement notes.
