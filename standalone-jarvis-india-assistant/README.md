# JARVIS India Assistant (Independent Repository Ready)

A standalone, voice-enabled assistant focused on Indian share market education and live quote lookups.

## Features
- 🎤 Voice input (Web Speech API, browser-supported)
- 🔊 Voice output (speechSynthesis)
- 📚 Built-in Indian market knowledge base (NSE/BSE/SEBI, analysis methods, derivatives, taxation, risk)
- 📈 Quote lookup endpoint via Yahoo Finance (`quote SYMBOL`, e.g. `quote TCS`, `quote RELIANCE`)
- 🧩 Fully independent Node + Express app (not coupled to INRT wallet code)

## Run locally
```bash
cd standalone-jarvis-india-assistant
npm install
npm run dev
```
Open: `http://localhost:5050`

## API endpoints
- `GET /api/health`
- `GET /api/quote?symbol=RELIANCE`
- `POST /api/ask` with JSON `{ "message": "Explain options Greeks" }`

## Publish as a new public GitHub repository
From inside `standalone-jarvis-india-assistant`:
```bash
git init
git add .
git commit -m "Initial commit: independent JARVIS India assistant"
git branch -M main
git remote add origin https://github.com/<your-username>/jarvis-india-assistant.git
git push -u origin main
```

## Notes
- This project is educational and not investment advice.
- Tax/regulatory interpretation may change; always verify with current SEBI and Income Tax rules.
