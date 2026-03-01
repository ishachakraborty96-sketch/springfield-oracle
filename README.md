# 🟡 Springfield Oracle

**The definitive open-source tracker for every Simpsons prediction — sourced, scored, and fact-checked.**

> *"If you throw enough darts, you're going to get some bullseyes."* — Al Jean, Simpsons Producer

---

## What is this?

Every TikTok about Simpsons predictions is 60 seconds with no sources. Every article is a listicle with no methodology. No one has built a proper, sourced, confidence-scored database — until now.

Springfield Oracle tracks every meaningful Simpsons prediction with:
- ✅ Verified episode references (Season, Episode, air date)
- 📰 Real event citations with dates
- 🔢 Viral score (1–10) and years-early gap
- 🟡 Status: **Confirmed / Pending / Disputed**
- ⚠️ Fact-check notes on viral claims that are AI-generated fakes
- 📡 Live news feed (Google News RSS, refreshes every 5 minutes)

---

## Why it matters right now

On **February 28, 2026**, the US and Israel launched Operation Epic Fury — joint strikes on Iran killing Supreme Leader Khamenei. Iran retaliated against Gulf states. The UN Security Council convened an emergency session.

In 1995, S06E19 "Lisa's Wedding" had a character say: *"Well, we saved your ass in World War III."*

31 years early.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (zero dependencies, fast) |
| Database | `predictions.json` — edit in GitHub browser to update |
| News Feed | Google News RSS via Vercel serverless function |
| Hosting | Vercel (free tier) |
| Updates | Push to `main` → auto-deploys in 30 seconds |

---

## How to add a prediction

Anyone can contribute. The database lives in one file:

```
public/data/predictions.json
```

Each entry follows this schema:

```json
{
  "id": "SP044",
  "season": 6,
  "episode": 19,
  "episode_code": "S06E19",
  "title": "Your prediction title",
  "episode_name": "Lisa's Wedding",
  "year_aired": 1995,
  "prediction": "What the episode depicted.",
  "real_event": "What actually happened in the real world.",
  "real_year": 2026,
  "years_early": 31,
  "category": "Politics",
  "status": "confirmed",
  "viral_score": 9,
  "verified_source": "Link to source that confirms this",
  "fact_check_note": "Optional — add if the claim is disputed or if fakes are circulating"
}
```

**Status options:** `confirmed` · `pending` · `disputed`

**Categories:** `Politics` · `Technology` · `Science` · `Sports` · `Business` · `Culture`

**To submit:** Open a Pull Request with your addition to `predictions.json`. Include at least one verifiable source. Disputed entries are welcome — just mark them correctly.

---

## What we don't do

- ❌ No AI-generated deepfake clips accepted as evidence
- ❌ No predictions without a verifiable season + episode reference
- ❌ No ads, ever
- ❌ No affiliate links
- ❌ No rage-bait "THEY KNEW" framing — we let the data speak

---

## Sources

All predictions sourced from:
- [Wikipedia — The Simpsons future predictions](https://en.wikipedia.org/wiki/The_Simpsons_future_predictions)
- [Hollywood Reporter — Simpsons Predictions](https://www.hollywoodreporter.com/tv/tv-news/simpsons-future-predictions-accurate-1140775/)
- [Simpsons Fandom Wiki](https://simpsons.fandom.com/wiki/The_Simpsons_future_predictions)
- [TVLine — Most Unexpected Predictions](https://tvtropes.org/pmwiki/pmwiki.php/Recap/TheSimpsonsS6E19LisasWedding)
- [Fox News — Full Predictions List](https://www.foxnews.com/entertainment/the-simpsons-has-predicted-the-future-many-times-heres-the-list)
- Snopes, Boatos.org for deepfake debunks

---

## Run locally

```bash
git clone https://github.com/YOURUSERNAME/springfield-oracle.git
cd springfield-oracle
npx vercel dev
```

Or just open `public/index.html` directly in a browser — it works without a server (news feed requires the Vercel function).

---

## License

© 2026 Isha Godboley. Licensed under [Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/).

You are free to share and adapt this work for **non-commercial purposes**, provided you give appropriate credit to **Isha Godboley** and link back to the original. Commercial use, redistribution without attribution, or passing this off as your own work is not permitted.

---

*Not affiliated with Fox, Disney, or The Simpsons. Built by a fan, for the internet.*
