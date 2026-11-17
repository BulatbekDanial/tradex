# TradeX

**Learn investing by defending real decisions.**

Live demo: https://tradex-teal.vercel.app
Pitch deck: https://claude.ai/artifact/CZXCJzLzsPDU8iqNxBCRJq

TradeX is a case-based investing simulator for high-school students. Each case is a fictional client with a goal, a deadline and limits. The student builds a portfolio for that client, writes an investment thesis and defends it before an AI board of directors. The score rewards reasoning, not luck: 40 of 100 points come from calculated portfolio metrics (risk, diversification, fit with the client's goal), 60 from the quality of the argument.

## Problem

School stock-market games rank students by returns, so the winner is often the one who got lucky. Students rarely learn to explain a decision or get feedback on their reasoning.

## Target users

- High-school students aged 14–18 interested in finance and preparing for competitions such as the Wharton Global High School Investment Competition
- Economics and financial-literacy teachers (class mode with before/after knowledge checks)

## Features

- Client cases: brief → portfolio → thesis → defense → verdict
- AI board of directors: chair, risk manager, growth advocate, ESG analyst, skeptic
- Trading terminal: candlestick, line, bar and Heikin-Ashi charts, 26 technical indicators, drawing tools (trend lines, Fibonacci, channels, pitchfork)
- Scenario market with real tickers (US stocks, ETFs) and simulated prices, plus a Live playback mode
- Micro-lessons, leagues and tournaments, teacher class mode with a pilot report
- Light and dark themes, privacy policy, consent banner, data export and deletion

Prices are scenario-generated for learning. TradeX uses virtual money only and gives no investment advice.

## Tech stack

- HTML5, CSS3, JavaScript (ES6+), no build step
- Custom charting engine on the Canvas API
- localStorage for progress
- LLM (Claude API) for the AI board, with rule-based offline scoring
- Hosted on Vercel

## Project structure

| File | Purpose |
|---|---|
| `index.html` | App shell, styles, meta tags |
| `core.js` | Scenario market, portfolio metrics, scoring |
| `chart.js` | Canvas charting engine and indicators |
| `ai.js` | AI board orchestration and offline fallback |
| `legal.js` | Privacy, terms, cookies, consent |
| `app.js` | Views, routing, onboarding, UI |

## Run locally

```bash
git clone https://github.com/BulatbekDanial/tradex.git
cd tradex
python3 -m http.server 8000
```

Open http://localhost:8000.

## Team

Danial Bulatbek (team lead), Ibrahim Khydyrqul, Baktiyar Meirkhanov, Ademi Bulatbek. Mentor: Zhalgas Mussagaliyev.
