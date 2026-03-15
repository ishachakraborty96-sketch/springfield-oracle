#!/usr/bin/env python3
"""
Springfield Oracle — News Monitor
Searches for recent news matching pending predictions and updates
status (confirmed/debunked) or adjusts likelihood_pct accordingly.

Requires:
  pip install anthropic

Usage:
  python scripts/news-monitor.py              # dry-run, prints proposed changes
  python scripts/news-monitor.py --apply      # writes changes to predictions.json
  python scripts/news-monitor.py --id SP045   # check a single prediction

Env:
  ANTHROPIC_API_KEY  — required
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic package not installed. Run: pip install anthropic")
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_JSON   = ROOT / "data" / "predictions.json"
PUBLIC_JSON = ROOT / "public" / "data" / "predictions.json"

# ── Config ─────────────────────────────────────────────────────────────────────
LIKELIHOOD_CHANGE_THRESHOLD = 5   # minimum % shift to count as "significant"
STATUS_CONFIDENCE_THRESHOLD = 80  # Claude's confidence % to auto-change status

SYSTEM_PROMPT = """You are a fact-checker for the Springfield Oracle, a site that tracks
Simpsons predictions against real-world events.

Given a pending prediction and recent news search results, you must:
1. Assess whether any news CONFIRMS or DEBUNKS the prediction, or is simply a
   supporting/counter signal that adjusts likelihood.
2. Return a JSON object with:
   {
     "status_change": "confirmed" | "debunked" | null,
     "status_confidence": <0-100>,
     "new_likelihood_pct": <0-100>,
     "reasoning": "<one sentence>",
     "key_evidence": "<headline or fact that drove your decision>"
   }

Rules:
- "confirmed" only if the real-world event has definitively occurred.
- "debunked" only if the prediction is now clearly impossible or proven false.
- null means still pending — adjust likelihood only.
- Be conservative: default to null unless evidence is very clear.
- For likelihood, consider trajectory: is the world moving toward or away from this?
"""


def load_predictions(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def save_predictions(data: dict, path: Path):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved → {path}")


def build_search_query(pred: dict) -> str:
    """Build a focused news search query for a prediction."""
    parts = [pred.get("title", "")]
    category = pred.get("category", "")
    if category:
        parts.append(category)
    # Add key terms from prediction text
    prediction_text = pred.get("prediction", pred.get("desc", ""))
    # Take first 80 chars as context
    parts.append(prediction_text[:80])
    return " ".join(parts)


def check_prediction(client: anthropic.Anthropic, pred: dict) -> dict | None:
    """
    Use Claude with web search to check if a prediction should be updated.
    Returns a result dict, or None if something went wrong.
    """
    query = build_search_query(pred)
    prediction_text = pred.get("desc") or pred.get("prediction", "")

    prompt = f"""Prediction ID: {pred["id"]}
Title: {pred["title"]}
Episode: {pred.get("episode_code","?")} – {pred.get("episode_name","?")} ({pred.get("year_aired","?")})
Category: {pred.get("category","?")}
Current likelihood: {pred.get("likelihood_pct","?")}%

Prediction text:
{prediction_text}

Search for recent news (last 12 months) about: {query}

Then return your JSON assessment."""

    try:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            betas=["web-search-2025-03-05"],
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract the text block from the response
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        # Parse JSON from the response
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            print(f"  WARNING: No JSON found in response for {pred['id']}")
            return None

        result = json.loads(text[start:end])
        return result

    except Exception as e:
        print(f"  ERROR checking {pred['id']}: {e}")
        return None


def apply_update(pred: dict, result: dict, dry_run: bool) -> dict:
    """Apply (or preview) an update to a prediction dict."""
    changes = []
    updated = dict(pred)

    old_status = pred.get("status", "pending")
    old_likelihood = pred.get("likelihood_pct", 0)

    status_change = result.get("status_change")
    confidence = result.get("status_confidence", 0)
    new_likelihood = result.get("new_likelihood_pct", old_likelihood)

    # Status change — only if confidence is high enough
    if status_change and confidence >= STATUS_CONFIDENCE_THRESHOLD:
        updated["status"] = status_change
        changes.append(f"status: pending → {status_change} (confidence {confidence}%)")
        if status_change in ("confirmed", "debunked"):
            updated["real_year"] = datetime.now().year

    # Likelihood change — only if significant
    if abs(new_likelihood - old_likelihood) >= LIKELIHOOD_CHANGE_THRESHOLD:
        updated["likelihood_pct"] = new_likelihood
        changes.append(f"likelihood: {old_likelihood}% → {new_likelihood}%")

    if not changes:
        return pred  # no meaningful change

    updated["last_updated"] = datetime.now().isoformat()
    updated["news_monitor_note"] = result.get("reasoning", "")
    updated["news_monitor_evidence"] = result.get("key_evidence", "")

    tag = "[DRY RUN] " if dry_run else ""
    print(f"  {tag}{pred['id']} — {pred['title']}")
    for c in changes:
        print(f"    • {c}")
    print(f"    Evidence: {result.get('key_evidence','—')}")
    print(f"    Reasoning: {result.get('reasoning','—')}")

    return updated if not dry_run else pred


def run(target_id: str | None, dry_run: bool):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    data = load_predictions(DATA_JSON)
    pending = [
        p for p in data["predictions"]
        if p.get("status", "").lower() == "pending"
        and (target_id is None or p["id"] == target_id)
    ]

    if not pending:
        print("No pending predictions to check." if not target_id
              else f"No pending prediction found with id={target_id}")
        return

    print(f"\n{'='*70}")
    print(f"Springfield Oracle — News Monitor   {datetime.now():%Y-%m-%d %H:%M}")
    print(f"Checking {len(pending)} pending prediction(s)   dry_run={dry_run}")
    print(f"{'='*70}\n")

    changed_ids = set()

    for pred in pending:
        print(f"Checking {pred['id']}: {pred['title']} …")
        result = check_prediction(client, pred)
        if result is None:
            print("  Skipped (no result).\n")
            continue

        updated = apply_update(pred, result, dry_run)
        if updated is not pred:
            # Replace in data
            idx = next(i for i, p in enumerate(data["predictions"]) if p["id"] == pred["id"])
            data["predictions"][idx] = updated
            changed_ids.add(pred["id"])
        print()

    print(f"{'='*70}")
    print(f"Done. {len(changed_ids)} prediction(s) updated.\n")

    if changed_ids and not dry_run:
        # Update meta
        data["meta"]["last_updated"] = datetime.now().strftime("%Y-%m-%d")
        data["meta"]["last_automated_update"] = datetime.now().isoformat()
        data["meta"]["update_note"] = (
            f"news-monitor updated {len(changed_ids)} prediction(s): {', '.join(sorted(changed_ids))}"
        )

        save_predictions(data, DATA_JSON)

        # Sync to public/data as well
        pub_data = load_predictions(PUBLIC_JSON)
        pub_map = {p["id"]: i for i, p in enumerate(pub_data["predictions"])}
        for pred_id in changed_ids:
            updated_pred = next(p for p in data["predictions"] if p["id"] == pred_id)
            if pred_id in pub_map:
                pub_data["predictions"][pub_map[pred_id]] = updated_pred
            else:
                pub_data["predictions"].append(updated_pred)
        save_predictions(pub_data, PUBLIC_JSON)

        print("\nNext step: run `node scripts/generate-static.js` to rebuild static pages.")
    elif dry_run and changed_ids:
        print("Dry run — no files written. Rerun with --apply to save changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Springfield Oracle news monitor")
    parser.add_argument("--apply", action="store_true",
                        help="Write changes to predictions.json (default: dry run)")
    parser.add_argument("--id", metavar="PREDICTION_ID",
                        help="Check only this prediction ID (e.g. SP045)")
    args = parser.parse_args()

    run(target_id=args.id, dry_run=not args.apply)
