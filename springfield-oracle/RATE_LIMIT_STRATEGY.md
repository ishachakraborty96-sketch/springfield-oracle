# Springfield Oracle — GitHub Rate Limit Strategy

## Problem
- **Vercel + GitHub API Limit:** 20-hour rate limit
- **Risk:** Frequent commits exhaust rate limits → automation fails

## Solution: Intelligent Update Strategy

### Key Features

#### 1️⃣ **Significant Change Threshold**
- Only commits if likelihood changes **≥5%**
- Prevents unnecessary commits that waste rate limit quota
- Caches predictions locally even if not committed

#### 2️⃣ **Smart Batching**
- Batches multiple prediction updates into single commit
- Groups all PENDING predictions into one transaction
- Reduces commit frequency significantly

#### 3️⃣ **Exponential Backoff**
- Retries failed pushes up to 3 times
- Waits 2s → 4s → 8s between attempts
- Handles transient network issues gracefully

#### 4️⃣ **Local Caching**
- Stores news data in `.news_cache.json`
- Avoids redundant API calls
- Allows offline operation

#### 5️⃣ **Graceful Degradation**
- If rate limited, changes are saved locally
- Next scheduled run attempts commit again
- Never fails the automation workflow

---

## How It Works

### Weekly Automation Flow

```
Sunday 00:00 UTC
    ↓
GitHub Actions Trigger
    ↓
Python Script Runs (weekly-update-v2.py)
    ↓
├─ Load cached news data
├─ Calculate likelihood for 4 PENDING predictions
├─ Check if changes ≥5% threshold
└─ Update data/predictions.json
    ↓
Is there significant change?
├─ NO: ✓ Skip commit, preserve rate limit
└─ YES:
    ├─ Stage changes
    ├─ Commit to local repo
    ├─ Try to push (with 3 retries + backoff)
    ├─ Success: ✓ Data live on Vercel
    └─ Fail: ⚠️ Changes saved locally, retry next week
```

### Rate Limit Preservation

**Conservative Estimate:**
- Typical updates: 2-3 commits per month (if 5%+ changes)
- GitHub limit: ~144 API operations per 20-hour window (via Vercel)
- Safety margin: Each commit uses ~3-5 operations
- Result: Plenty of headroom ✓

---

## Fallback Procedures

### If Rate Limited (20-hour window active)

1. **Data Updates Happen Anyway**
   - Predictions are recalculated and saved locally
   - `data/predictions.json` is updated
   - Changes persist in git working directory

2. **Push Retried Automatically**
   - Script attempts push 3 times with exponential backoff
   - If all fail, exits gracefully (doesn't crash workflow)
   - Next Sunday's run will try again

3. **Manual Recovery**
   ```bash
   cd springfield-oracle

   # Check local changes
   git status

   # When rate limit resets (after 20 hours)
   git push
   ```

---

## Configuration

### Change Threshold (editable)
```python
RATE_LIMIT_THRESHOLD = 5  # Only commit if change > 5%
```

### Retry Strategy (editable)
```python
MAX_RETRIES = 3           # Number of push attempts
BACKOFF_FACTOR = 2        # 2^n seconds between retries
```

### Run Schedule (in GitHub Actions)
```yaml
schedule:
  - cron: '0 0 * * 0'     # Every Sunday at midnight UTC
```

---

## Monitoring

### Check Script Status
```bash
# See last 20 lines of predictions.json (includes metadata)
tail -20 springfield-oracle/data/predictions.json

# Check when script last ran
grep "last_automated_update" springfield-oracle/data/predictions.json
```

### GitHub Actions Logs
1. Go to repository → Actions tab
2. Click "Weekly Predictions Update"
3. See execution history and logs

### Local Status
```bash
git log --oneline -5  # See recent commits
git status            # Check for uncommitted changes
```

---

## What Gets Updated Weekly

### ✓ Automatically Recalculated
- All PENDING prediction likelihood scores
- Supporting links count
- Counter arguments count
- Last updated timestamp

### ✗ Not Updated Weekly
- Prediction text/descriptions
- Episode references
- Category assignments
- Heating ranks (unless >5% change)

### 📝 Manual Updates Still Needed
- Add new predictions
- Update supporting_links with new articles
- Mark predictions as confirmed/debunked
- Adjust heating_note text

---

## Future Improvements

1. **News API Integration**
   - Fetch articles automatically
   - Update supporting_links dynamically
   - Rate this against API costs

2. **Selective Updates**
   - Only update PENDING predictions
   - Skip confirmed/debunked predictions
   - Further reduce rate limit usage

3. **Batch Notification**
   - Slack/email weekly summary
   - Only on significant changes
   - Reduces notification fatigue

---

## Summary

**Rate Limit Strategy:** Smart, conservative, resilient

| Aspect | Strategy |
|--------|----------|
| **Commit Frequency** | Only on 5%+ changes (2-3x/month typical) |
| **Retry Logic** | Exponential backoff, up to 3 attempts |
| **Fallback** | Local save, retry next week |
| **Monitoring** | GitHub Actions logs + git status |
| **Manual Recovery** | Simple `git push` command |

✅ **Result:** Reliable automation that respects Vercel's 20-hour GitHub rate limit
