# 🔮 Springfield Oracle

**The open-source tracker for every Simpsons prediction — sourced, fact-checked, and updated in real time.**

> *The show has been right too many times to not track it properly.*

---

## What is this?

Every TikTok about Simpsons predictions has no sources. Every listicle has no methodology. Half the viral clips circulating right now are AI-generated fakes.

Springfield Oracle is the database nobody had built — every meaningful Simpsons prediction tracked with verified episode references, real event citations, and honest fact-checks on the claims that don't hold up.

---

## Features

- ✅ Verified episode references — season, episode code, air date
- 📰 Real event citations with sources
- 🟡 Status: **Confirmed / Pending / Disputed**
- ⚠️ Fact-check notes flagging deepfakes and misattributions
- 📡 Live news feed auto-matching breaking headlines to predictions
- 🔓 Community submissions open

---

## Status Definitions

| Status | Meaning |
|---|---|
| **Confirmed** | The prediction has occurred. Sourced and verified. |
| **Pending** | Has not yet occurred, or is currently unfolding. |
| **Disputed** | The connection is contested, or the viral version misrepresents the source. |

---

## How to Add a Prediction

Community contributions are welcome. To submit a prediction, open a Pull Request with your addition to:

```
public/data/predictions.json
```

Every submission requires at minimum:
- A verifiable season number and episode code
- An original air date
- At least one external source for the real-world event
- An honest status assessment

Predictions without a verified episode source will not be accepted.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS |
| Hosting | Vercel |
| News Feed | Google News RSS via Vercel serverless function |

---

## Run Locally

```bash
git clone https://github.com/YOURUSERNAME/springfield-oracle.git
cd springfield-oracle
npx vercel dev
```

Or open `public/index.html` directly in a browser. The news feed requires the Vercel function to run.

### Environment Variables

For the newsletter subscription feature to work with BeehivIV, you need to set the following environment variable on Vercel:

- `BEEHIIV_API_KEY` - Your BeehivIV API key (obtain from https://app.beehiiv.com/settings/api)

Add this in your Vercel project settings under Environment Variables.

---

## License

© 2026 Isha Godboley. Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

Free to share and adapt for non-commercial purposes with attribution. Commercial use without permission is not allowed.

---

*Not affiliated with Fox, Disney, or The Simpsons.*
