#!/usr/bin/env python3
"""
Springfield Oracle - Sunday Prediction Update Script
Fetches latest news for PENDING predictions and updates likelihood scores
Runs automatically every Sunday at midnight UTC via GitHub Actions
"""

import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
import sys

# News sources to search
NEWS_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.reuters.com/reuters/worldNews",
    "https://www.theverge.com/rss/index.xml"
]

GOOGLE_NEWS_SEARCH = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

def extract_keywords(text):
    """Extract significant keywords from prediction text"""
    stop_words = {'the', 'and', 'or', 'a', 'an', 'is', 'are', 'was', 'be', 'to', 'in', 'of'}
    words = text.split()
    keywords = [word.strip(".,()").lower() for word in words
                if len(word.strip(".,()")) > 3 and word.strip(".,()").lower() not in stop_words]
    return keywords[:3]  # Return top 3 keywords

def get_news_velocity(prediction_text, max_matches=10):
    """Search RSS feeds for keyword matches and calculate velocity score"""
    keywords = extract_keywords(prediction_text)
    if not keywords:
        return 0.0, 0

    search_query = urllib.parse.quote(" ".join(keywords))
    total_matches = 0
    headers = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}

    urls_to_check = NEWS_FEEDS + [GOOGLE_NEWS_SEARCH.format(query=search_query)]

    for url in urls_to_check:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                tree = ET.fromstring(resp.read())
                for item in tree.findall('.//item'):
                    title_elem = item.find('title')
                    desc_elem = item.find('description')

                    title = title_elem.text if title_elem is not None else ""
                    desc = desc_elem.text if desc_elem is not None else ""
                    content = (title + " " + desc).lower()

                    # Check if any keyword appears in the news item
                    if any(kw in content for kw in keywords):
                        total_matches += 1
                        if total_matches >= max_matches:
                            return min(total_matches / 10, 1.0), total_matches
        except Exception as e:
            print(f"  ⚠️  Feed error ({url[:40]}...): {str(e)[:50]}", file=sys.stderr)
            continue

    # Normalize: 10 matches = 1.0 (100% velocity)
    velocity = min(total_matches / 10, 1.0) if total_matches > 0 else 0.0
    return velocity, total_matches

def calculate_weighted_likelihood(prediction, news_velocity):
    """Calculate final likelihood percentage using weighted formula"""
    comp = prediction.get('likelihood_components', {
        'category_base_rate': 0.5,
        'plausibility_score': 0.5,
        'specificity_score': 0.5
    })

    # Weights: Base Rate (30%) + Plausibility (25%) + Specificity (20%) + News Velocity (25%)
    weighted = (
        comp.get('category_base_rate', 0.5) * 0.30 +
        comp.get('plausibility_score', 0.5) * 0.25 +
        comp.get('specificity_score', 0.5) * 0.20 +
        news_velocity * 0.25
    )

    return round(weighted * 100)

def update_predictions_database(json_path='springfield-oracle/public/data/predictions.json'):
    """Main update function"""
    print("\n" + "="*70)
    print(f"🔮 SPRINGFIELD ORACLE - PREDICTION UPDATE")
    print(f"   Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("="*70)

    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: {json_path} not found")
        return False

    pending_count = 0
    updated_count = 0
    top_3_heating = []

    print(f"\n📊 Processing {len(data.get('predictions', []))} predictions...\n")

    for prediction in data['predictions']:
        # Rename DISPUTED to DEBUNKED (maintenance)
        if prediction.get('status', '').upper() == 'DISPUTED':
            prediction['status'] = 'DEBUNKED'
            print(f"  🔄 Renamed {prediction['id']}: DISPUTED → DEBUNKED")

        # Process PENDING predictions
        if prediction.get('status') == 'PENDING':
            pending_count += 1
            title = prediction.get('title', 'Unknown')
            pred_text = prediction.get('prediction', '')

            print(f"\n  🔍 [{pending_count}] {prediction['id']} - {title}")
            print(f"     Searching news for: {extract_keywords(pred_text)}")

            # Get news velocity
            velocity, match_count = get_news_velocity(pred_text)
            print(f"     News matches found: {match_count} (velocity: {velocity:.2f})")

            # Calculate new likelihood
            old_likelihood = prediction.get('likelihood_pct', 0)
            new_likelihood = calculate_weighted_likelihood(prediction, velocity)

            # Update prediction
            prediction['likelihood_pct'] = new_likelihood
            prediction['likelihood_components']['news_velocity_score'] = velocity
            prediction['news_matches'] = match_count
            prediction['last_updated'] = datetime.now().isoformat()

            updated_count += 1

            # Track heating-up predictions (high velocity, good likelihood)
            if velocity >= 0.75 or match_count >= 8:
                top_3_heating.append({
                    'id': prediction['id'],
                    'title': title,
                    'likelihood': new_likelihood,
                    'velocity': velocity,
                    'matches': match_count
                })

            change = new_likelihood - old_likelihood
            arrow = "📈" if change > 5 else "📉" if change < -5 else "➡️"
            print(f"     Likelihood: {old_likelihood}% → {new_likelihood}% {arrow}")

    # Update metadata
    data['meta']['last_updated'] = datetime.now().strftime('%Y-%m-%d')
    data['meta']['status_update'] = f"PENDING predictions updated with real-time news velocity analysis"
    data['meta']['last_maintenance'] = datetime.now().isoformat()

    # Save updated predictions
    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)

    # Print summary
    print("\n" + "="*70)
    print(f"✅ UPDATE COMPLETE")
    print(f"   Predictions processed: {pending_count} PENDING")
    print(f"   Likelihood scores updated: {updated_count}")

    if top_3_heating:
        top_3_heating.sort(key=lambda x: (x['velocity'], x['likelihood']), reverse=True)
        print(f"\n🔥 TOP 3 HEATING-UP PREDICTIONS:")
        for i, pred in enumerate(top_3_heating[:3], 1):
            print(f"   {i}. {pred['id']} - {pred['title']}")
            print(f"      Likelihood: {pred['likelihood']}% | Velocity: {pred['velocity']:.2%} | Matches: {pred['matches']}")

    print(f"\n   Database saved to: {json_path}")
    print(f"   Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("="*70 + "\n")

    return True

if __name__ == "__main__":
    success = update_predictions_database()
    sys.exit(0 if success else 1)
