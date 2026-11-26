# Training Log

One screen: today's workout from an 8-day cycle. Start, log reps / weight / rest, hold to finish.
The day locks until midnight, then the next workout opens. Rest days pass on their own;
extra days off never move the cycle on. Everything is written to a Google Sheet.

## The Sheet

`Training Log` with two tabs:

- **Sessions** — Session · Date · Cycle · Day · Workout · Start · Finish · Duration (min) · Sets · Avg rest (s) · Sauna · Stretch
  (one row per workout or rest day)
- **Sets** — Session · Date · Cycle · Day · Workout · Exercise · Movement · Set · Reps · Time (s) · Weight (kg) · Rest after (s)
  (one row per movement per set)

The Sheet is the source of truth: the app reads Sessions to know where the cycle is,
and Sets for the faint "last time" numbers.

## Setup (Vercel)

1. Import this repo in Vercel.
2. Add the env vars from `.env.example` — the Supabase and Google values are the same as OS.
3. On the iPhone: open the site in Safari → Share → Add to Home Screen.

## Adding someone (e.g. Alex)

1. Make her plan in `lib/plans.ts` (copy the shape of `ERYK`) and set `alex: { plan: ALEX }`.
2. Make a copy of the Training Log Sheet (clear the rows under the headers) and put its ID in `ALEX_SHEET_ID`.
   The Sheet must be in, or shared with, the Google account behind the OAuth token.
3. Set `ALEX_EMAIL` to her OS login email.

## Local dev

```bash
cp .env.example .env.local   # fill in Supabase; set DEV_PERSON=eryk to skip sign-in
npm install
npm run dev
```
