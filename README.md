# Stockmark

Stockmark is a polished educational US stock-market dashboard with a local paper-trading portfolio. It uses Alpha Vantage through a small server-side proxy and never sends the API key to the browser.

## Run locally

1. Install Node.js 22.5 or newer. Vite 8 fails on Node 18, and the account database uses the built-in `node:sqlite` module. The server prints an `ExperimentalWarning` for it; that is expected.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and set `ALPHA_VANTAGE_API_KEY` on the server only.
4. Start the API proxy in one terminal: `npm run server`
5. Start the Vite app in another terminal: `npm run dev`
6. Open the URL printed by Vite (usually `http://localhost:5173`).

If the key is missing or Alpha Vantage reaches its free-tier limit, the app uses clearly labelled deterministic demo data so the paper-trading flow remains explorable.

## Available commands

- `npm run dev` — start the Vite development server
- `npm run server` — start the API on port 3001: the Alpha Vantage proxy plus the account and portfolio routes
- `npm run build` — create a production build
- `npm run preview` — preview the production build

## Notes

- Guests keep their watchlist, paper cash, holdings, transactions, recent searches and budget in browser `localStorage`.
- Signing up creates a real account in `data/stockmark.db` (SQLite, via the built-in `node:sqlite`). Passwords are stored as `scrypt` hashes, sessions are 30-day HttpOnly cookies, and every sign-in starts with **$10,000 in paper cash**. The watchlist, holdings, trades, alerts and budget plan are written back to the database a moment after each change, so they reappear after a reload, a logout or a different browser. `npm run server` must be running to sign in.
- Older password-free local demo profiles are gone. Their portfolios stayed in `localStorage` under `stockmark.account.*` keys and are not migrated into the database.
- The catalog includes 29 curated US stocks and ETFs with sector filtering; quote requests remain on demand to respect Alpha Vantage limits.
- Charts use Alpha Vantage daily history when available, otherwise fallback history, with `1M`, `3M`, and `All` ranges; repeated demo pills are intentionally omitted from the cards.
- The dashboard "Value over time" chart is reconstructed, not stored: each past trading day replays the account's timestamped trades backwards from today, values the shares held that day at that day's close, and adds the cash left after the later trades. The series starts when the account was created and its final point is the live portfolio total, so the line always ends on the number shown above it. A holding with no price series keeps its cost basis rather than inventing a move.
- Portfolio navigation from a guest session prompts for an account first; the landing dashboard, watchlist and stock exploration remain available to guests.
- Stock cards use lightweight inline company marks, so the app does not depend on a separate logo API or remote asset service.
- The email `admin@stockmark.local` is flagged as admin when it signs up, which unlocks the Admin board (add/remove catalog stocks, override the paper-market open/closed state). Those settings are stored in the `settings` table and served to every visitor by `GET /api/settings`, so one admin change reshapes the app for all browsers and accounts. Only an admin session may write them, and the admin flag itself is a convenience for a local demo, not secure authorization — anyone who can reach the server can register that address.
- Paper orders can be placed any time. Outside NYSE session hours they fill at the last updated price, and the trade window labels the price basis as such — the open/closed state is information, not a gate.
- Market data is cached in memory by the proxy (quotes for 60 seconds, history for 5 minutes, overview for 30 minutes).
- Alpha Vantage free-tier limits mean the app fetches on demand and offers a manual refresh instead of polling.
- This is not a brokerage connection. “Paper trade — no real money is involved.”
