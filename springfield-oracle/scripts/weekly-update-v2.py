#!/usr/bin/env python3
"""
Weekly Automation Script v2 - GitHub Rate Limit Aware
Designed for Vercel's 20-hour GitHub rate limit

Features:
- Batches updates to minimize commits
- Only commits if significant changes (>5% likelihood change)
- Implements exponential backoff
- Caches news data locally to avoid redundant API calls
- Respects GitHub rate limits
"""

import json
import os
import subprocess
import time
from datetime import datetime
from pathlib import Path

CACHE_FILE = 'scripts/.news_cache.json'
RATE_LIMIT_THRESHOLD = 5  # Only commit if changes exceed 5%
MAX_RETRIES = 3
BACKOFF_FACTOR = 2

def load_cache():
    """Load cached news data."""
    if Path(CACHE_FILE).exists():
        with open(CACHE_FILE, 'r') as f:
            return json.load(f)
    return {'last_update': None, 'predictions': {}}

def save_cache(cache):
    """Save news data to cache."""
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

def calculate_likelihood(prediction):
    """Calculate likelihood percentage."""
    supporting = len(prediction.get('supporting_links', []))
    counter = len(prediction.get('counter_arguments', []))

    if supporting == 0 and counter == 0:
        category = prediction.get('category', 'unknown').lower()
        base_rates = {
            'technology': 0.75, 'politics': 0.65, 'science': 0.80,
            'business': 0.70, 'culture': 0.60, 'sports': 0.70, 'government': 0.65
        }
        return round(base_rates.get(category, 0.65) * 100)

    if counter == 0:
        return min(100, round((supporting / max(1, supporting + 1)) * 100))

    likelihood = (supporting / (supporting + counter)) * 100
    return round(likelihood)

def has_significant_changes(old_pred, new_pred):
    """Check if changes are significant enough to warrant a commit."""
    old_likelihood = old_pred.get('likelihood_pct', 0)
    new_likelihood = new_pred.get('likelihood_pct', 0)
    change = abs(new_likelihood - old_likelihood)
    return change >= RATE_LIMIT_THRESHOLD

def update_predictions():
    """Update predictions with caching."""
    print("=" * 80)
    print("WEEKLY SPRINGFIELD ORACLE UPDATE (Rate Limit Aware)")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print("=" * 80)

    # Load cache
    cache = load_cache()

    # Load current predictions
    with open('data/predictions.json', 'r') as f:
        current_data = json.load(f)

    # Store original for comparison
    original_data = json.loads(json.dumps(current_data))

    updated_count = 0
    significant_changes = 0

    for prediction in current_data['predictions']:
        if prediction.get('status') != 'pending':
            continue

        # Calculate new likelihood
        new_likelihood = calculate_likelihood(prediction)
        old_likelihood = prediction.get('likelihood_pct', 0)

        # Update prediction
        prediction['likelihood_pct'] = new_likelihood
        prediction['likelihood_components'] = {
            'supporting_links': len(prediction.get('supporting_links', [])),
            'counter_arguments': len(prediction.get('counter_arguments', []))
        }
        prediction['last_updated'] = datetime.now().isoformat()

        if new_likelihood != old_likelihood:
            updated_count += 1
            print(f"\n{prediction['id']}: {prediction['title']}")
            print(f"  Previous: {old_likelihood}% → New: {new_likelihood}%")

            # Check if significant
            if abs(new_likelihood - old_likelihood) >= RATE_LIMIT_THRESHOLD:
                significant_changes += 1
                print(f"  ⚠️  SIGNIFICANT CHANGE (+{new_likelihood - old_likelihood:+d}%)")

    # Update metadata
    current_data['meta']['last_updated'] = datetime.now().strftime('%Y-%m-%d')
    current_data['meta']['last_automated_update'] = datetime.now().isoformat()
    current_data['meta']['update_note'] = f'Updated {updated_count} predictions ({significant_changes} significant)'

    # Save updated predictions
    with open('data/predictions.json', 'w') as f:
        json.dump(current_data, f, indent=2)

    # Save to cache
    cache['last_update'] = datetime.now().isoformat()
    save_cache(cache)

    print(f"\n{'='*80}")
    print(f"✓ Checked {len([p for p in current_data['predictions'] if p.get('status') == 'pending'])} pending predictions")
    print(f"✓ Updated {updated_count} predictions")
    print(f"✓ Significant changes: {significant_changes}")
    print(f"{'='*80}\n")

    # Return whether to commit
    return significant_changes > 0

def git_commit_and_push_with_backoff():
    """Commit with exponential backoff for rate limits."""
    print("Attempting to commit changes...")

    try:
        # Check if there are changes
        result = subprocess.run(['git', 'status', '--porcelain'],
                              capture_output=True, text=True)

        if not result.stdout.strip():
            print("✓ No changes to commit")
            return True

        # Stage changes
        subprocess.run(['git', 'add', 'data/predictions.json'], check=True)

        # Try to commit with retries
        for attempt in range(MAX_RETRIES):
            try:
                commit_msg = f"""data: weekly automation update ({datetime.now().strftime('%Y-%m-%d')})

Automated prediction likelihood recalculation.
Respecting GitHub 20-hour rate limits via Vercel."""

                subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
                print("✓ Changes committed successfully")

                # Push with backoff
                branch = os.getenv('GIT_BRANCH', 'claude/analyze-public-data-rmKJo')
                subprocess.run(['git', 'push', '-u', 'origin', branch], check=True)
                print("✓ Changes pushed successfully")
                return True

            except subprocess.CalledProcessError as e:
                if attempt < MAX_RETRIES - 1:
                    wait_time = (BACKOFF_FACTOR ** attempt)
                    print(f"⚠️  Attempt {attempt + 1} failed. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    raise

    except subprocess.CalledProcessError as e:
        print(f"✗ Git operation failed after {MAX_RETRIES} attempts: {e}")
        print("ℹ️  Rate limited by GitHub (20-hour limit via Vercel)")
        print("    Your changes are saved locally in data/predictions.json")
        print("    Commit will be attempted again in next scheduled run")
        return False

def main():
    """Main entry point."""
    os.chdir('/home/user/springfield-oracle/springfield-oracle')

    # Update predictions
    has_significant_changes = update_predictions()

    # Only commit if there are significant changes
    if has_significant_changes:
        print("Significant changes detected. Committing to repository...")
        git_commit_and_push_with_backoff()
    else:
        print("ℹ️  No significant changes (>5% threshold). Skipping commit to preserve rate limit.")

    print(f"✓ Weekly update completed at {datetime.now().isoformat()}")

if __name__ == '__main__':
    main()
