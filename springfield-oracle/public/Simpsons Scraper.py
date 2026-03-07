import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime

# Aggregates BBC, The Verge, and keyword-specific Google News searches
RSS_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.theverge.com/rss/index.xml",
    "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
]

def get_news_velocity(prediction_text):
    """Searches RSS feeds for keyword matches to determine 'Velocity'"""
    # Extract keywords longer than 4 chars to avoid 'the', 'and', etc.
    keywords = [word.strip(".,()").lower() for word in prediction_text.split() if len(word) > 4]
    
    # Create a search query for Google News using the first 3 significant keywords
    search_query = urllib.parse.quote(" ".join(keywords[:3]))
    matches = 0
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
    
    for url_template in RSS_FEEDS:
        # If it's the Google News link, inject the search query
        url = url_template.format(query=search_query) if "{query}" in url_template else url_template
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                tree = ET.fromstring(resp.read())
                for item in tree.findall('.//item'):
                    title = item.find('title').text or ""
                    description = item.find('description').text or ""
                    content = (title + " " + description).lower()
                    # Increment match count if any keyword appears in the news
                    if any(kw in content for kw in keywords[:3]):
                        matches += 1
        except Exception as e:
            continue
            
    # Normalize score: 10 matches = 1.0 (100% velocity)
    return min(matches / 10, 1.0)

def update_database():
    try:
        with open('predictions.json', 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: predictions.json not found in this directory.")
        return

    print(f"--- Starting Update: {datetime.now().strftime('%Y-%m-%d %H:%M')} ---")

    for p in data['predictions']:
        # Rename Status (Maintenance)
        if p.get('status', '').upper() == 'DISPUTED':
            p['status'] = 'DEBUNKED'
            print(f"Renamed: {p['id']} status to DEBUNKED")

        # Live Scoring for PENDING items
        if p.get('status') == 'PENDING':
            velocity = get_news_velocity(p['prediction'])
            
            # Use weighted formula
            comp = p.get('likelihood_components', {
                "category_base_rate": 0.5, 
                "plausibility_score": 0.5, 
                "specificity_score": 0.5
            })
            
            # Weighted calculation: Base Rate (30%) + Plausibility (25%) + Specificity (20%) + News Velocity (25%)
            weighted_score = (comp.get('category_base_rate', 0.5) * 0.3) + \
                             (comp.get('plausibility_score', 0.5) * 0.25) + \
                             (comp.get('specificity_score', 0.5) * 0.2) + \
                             (velocity * 0.25)
            
            p['likelihood_pct'] = round(weighted_score * 100)
            p['likelihood_components']['news_velocity_score'] = velocity
            p['last_updated'] = datetime.now().isoformat()
            
            print(f"Scored {p['id']} [{p['title']}]: {p['likelihood_pct']}% Likelihood")

    with open('predictions.json', 'w') as f:
        json.dump(data, f, indent=2)
    print("--- Update Complete: predictions.json has been saved. ---")

if __name__ == "__main__":
    update_database()