# Edgelog

Thesis-driven short-term trading journal. Built for a $100 learning account, mobile-first, around two strategies: post-earnings drift (PEAD) and 52-week-high breakouts.

## The playbook (lives in `lib/playbook.ts`)

- **Two strategies + confluence**: PEAD, 52w High Breakout, or both at once
- **Hard gates** every candidate must pass before consideration
- **Checkmark grading** → A / B / C / Skip
- **Variable position sizing**: A = $15, B = $10, C = $5
- **Manual end-of-day exits**: target / stop / time stop / discretionary
- **Long-only to start**

Edit `lib/playbook.ts` to tune gates, factors, exit levels, or sizing. UI reads from this single source.

## Setup

### 1. Supabase

1. Create a project at supabase.com (free tier is fine).
2. In the SQL Editor, run `supabase/migrations/0001_init.sql`.
3. In Authentication → Providers, ensure Email is enabled. Disable "Confirm email" for faster local testing if you want.
4. Grab your project URL and anon key from Settings → API.

### 2. API keys (free tiers)

- **Finnhub** (PEAD scanner): register at https://finnhub.io/register, copy your API key
- **FMP** (52w scanner): register at https://site.financialmodelingprep.com/register, copy your API key

### 3. Local dev

```bash
cp .env.example .env.local
# fill in the four values
npm install
npm run dev
```

### 4. Deploy to Vercel

1. Push this repo to GitHub
2. Import to Vercel
3. Add the four env vars in Vercel project settings
4. Deploy

## Daily workflow

**Morning (10 min):**
1. Open the app → Today tab
2. Tap Scanner → run PEAD and 52w scans
3. For each candidate worth a look, tap Grade → fill the gate checks and factor checks
4. If grade is A or B (or C and you really want it), commit the thesis and buy in your broker
5. If gates fail or grade is Skip, the form blocks you (Skip allows override with logged reason)

**Evening (5 min):**
1. Open Positions
2. For each, check today's close against stop and target
3. If anything triggered, close the position next morning at open, log the trade

## What to watch for in the journal

After 10–15 trades, look at:

- **Win rate by grade**: A's should beat C's. If they don't, your rubric isn't separating signal from noise.
- **Win rate by strategy**: which one actually works for you?
- **Exit reason mix**: lots of TIME exits = you're picking trades that don't move. Lots of DISCRETIONARY = you're undermining the system.
- **Expectancy**: win_rate × avg_win − loss_rate × avg_loss. Negative = stop trading and rethink.

## Tuning

The numbers in `lib/playbook.ts` (target %, stop %, time stop days, gate thresholds) are starting guesses, not validated. As real trade data accumulates in the journal, adjust them. Each tweak is its own learning loop.

## What's not built (v1 scope cuts)

- Real-time alerts (daily check is the discipline)
- Broker integration (orders happen manually in your broker)
- Backtesting (acknowledged tradeoff)
- Negative PEAD / 52w low (add later)
- Confluence auto-detection in scanner (you spot it when both scans surface same ticker)
