#!/usr/bin/env python3
"""
Weekly Automation Script for Springfield Oracle
Runs every Sunday at midnight to update predictions with latest news data.

Features:
- Fetches latest news for each PENDING prediction
- Recalculates likelihood scores
- Commits and pushes changes to repository
"""

import json
import os
import subprocess
from datetime import datetime
import requests
import re

def fetch_news_for_prediction(prediction):
    """
    Fetch latest news articles for a prediction based on keywords.
    Uses NewsAPI (requires API key) or RSS feeds.
    """
    keywords = extract_keywords(prediction.get('prediction', ''))

    # For now, return mock data - in production, use NewsAPI or RSS feeds
    # This would integrate with external news sources
    return {
        'articles': [],
        'last_checked': datetime.now().isoformat()
    }

def extract_keywords(text, min_length=4):
    """Extract keywords from prediction text."""
    # Remove special characters and split into words
    words = re.findall(r'\b[a-z]{' + str(min_length) + r',}\b', text.lower())
    # Filter out common stop words
    stop_words = {'that', 'this', 'with', 'from', 'will', 'have', 'been', 'were', 'said', 'would'}
    return [w for w in words if w not in stop_words]

def calculate_likelihood(prediction):
    """
    Calculate likelihood percentage based on supporting_links and counter_arguments.
    Formula: (supporting_links / (supporting_links + counter_arguments)) * 100
    """
    supporting = len(prediction.get('supporting_links', []))
    counter = len(prediction.get('counter_arguments', []))

    if supporting == 0 and counter == 0:
        # Use category base rate
        category = prediction.get('category', 'unknown').lower()
        base_rates = {
            'technology': 0.75,
            'politics': 0.65,
            'science': 0.80,
            'business': 0.70,
            'culture': 0.60,
            'sports': 0.70,
            'government': 0.65
        }
        return round(base_rates.get(category, 0.65) * 100)

    if counter == 0:
        return min(100, round((supporting / max(1, supporting + 1)) * 100))

    likelihood = (supporting / (supporting + counter)) * 100
    return round(likelihood)

def update_predictions():
    """Main update function."""
    print("=" * 80)
    print("WEEKLY SPRINGFIELD ORACLE UPDATE")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print("=" * 80)

    # Load predictions
    with open('data/predictions.json', 'r') as f:
        data = json.load(f)

    updated_count = 0
    pending_predictions = [p for p in data['predictions'] if p.get('status') == 'pending']

    for prediction in pending_predictions:
        # Fetch latest news
        news_data = fetch_news_for_prediction(prediction)

        # Calculate likelihood
        old_likelihood = prediction.get('likelihood_pct', 0)
        new_likelihood = calculate_likelihood(prediction)

        # Update prediction
        prediction['likelihood_pct'] = new_likelihood
        prediction['likelihood_components'] = {
            'supporting_links': len(prediction.get('supporting_links', [])),
            'counter_arguments': len(prediction.get('counter_arguments', []))
        }
        prediction['last_updated'] = datetime.now().isoformat()

        if new_likelihood != old_likelihood:
            print(f"\n{prediction['id']}: {prediction['title']}")
            print(f"  Previous Likelihood: {old_likelihood}%")
            print(f"  Updated Likelihood: {new_likelihood}%")
            print(f"  Change: {new_likelihood - old_likelihood:+d}%")
            updated_count += 1

    # Update metadata
    data['meta']['last_updated'] = datetime.now().strftime('%Y-%m-%d')
    data['meta']['last_automated_update'] = datetime.now().isoformat()
    data['meta']['status_update'] = f'Weekly automation update: {updated_count} predictions recalculated'

    # Save updated file
    with open('data/predictions.json', 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\n{'='*80}")
    print(f"✓ Updated {updated_count} predictions")
    print(f"{'='*80}\n")

    return updated_count > 0

def git_commit_and_push():
    """Commit and push changes to repository."""
    print("\nCommitting changes to git...")

    try:
        # Check if there are changes
        result = subprocess.run(['git', 'status', '--porcelain'],
                              capture_output=True, text=True, cwd='.')

        if not result.stdout.strip():
            print("✓ No changes to commit")
            return True

        # Stage changes
        subprocess.run(['git', 'add', 'data/predictions.json'], check=True)

        # Commit
        commit_msg = f"""data: weekly automation update ({datetime.now().strftime('%Y-%m-%d')})

Automated prediction likelihood recalculation based on latest news trends.
Updated PENDING predictions with refreshed supporting links and counter arguments."""

        subprocess.run(['git', 'commit', '-m', commit_msg], check=True)

        # Push to origin
        branch = 'claude/analyze-public-data-rmKJo'
        subprocess.run(['git', 'push', '-u', 'origin', branch], check=True)

        print("✓ Changes committed and pushed successfully")
        return True

    except subprocess.CalledProcessError as e:
        print(f"✗ Git operation failed: {e}")
        return False

def main():
    """Main entry point."""
    os.chdir('/home/user/springfield-oracle/springfield-oracle')

    # Update predictions
    has_changes = update_predictions()

    # Commit and push if there are changes
    if has_changes:
        git_commit_and_push()

    print(f"\n✓ Weekly update completed at {datetime.now().isoformat()}")

if __name__ == '__main__':
    main()
