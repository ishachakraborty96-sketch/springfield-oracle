#!/usr/bin/env python3
"""
Calculate likelihood scores for all PENDING predictions based on:
- supporting_links count (positive indicator)
- counter_arguments count (negative indicator)
"""

import json
from datetime import datetime

def calculateLikelihood(prediction):
    """
    Calculate likelihood percentage (0-100%) based on supporting_links vs counter_arguments.
    Formula: (supporting_links / (supporting_links + counter_arguments)) * 100
    """
    supporting = len(prediction.get('supporting_links', []))
    counter = len(prediction.get('counter_arguments', []))

    # Handle edge cases
    if supporting == 0 and counter == 0:
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

    # Formula: (supporting / (supporting + counter)) * 100
    likelihood = (supporting / (supporting + counter)) * 100
    return round(likelihood)

def main():
    # Load predictions
    with open('data/predictions.json', 'r') as f:
        data = json.load(f)

    print("=" * 80)
    print("CALCULATING LIKELIHOOD SCORES FOR ALL PENDING PREDICTIONS")
    print("=" * 80)

    # Update all PENDING predictions
    for p in data['predictions']:
        if p.get('status') == 'pending':
            p['likelihood_pct'] = calculateLikelihood(p)
            p['likelihood_components'] = {
                'supporting_links': len(p.get('supporting_links', [])),
                'counter_arguments': len(p.get('counter_arguments', []))
            }
            print(f"\n{p['id']}: {p['title']}")
            print(f"  Supporting Links: {p['likelihood_components']['supporting_links']}")
            print(f"  Counter Arguments: {p['likelihood_components']['counter_arguments']}")
            print(f"  Calculated Likelihood: {p['likelihood_pct']}%")

    # Add heating metadata
    top_3_heating = [
        {'id': 'SP038', 'rank': 1, 'level': 3, 'note': 'Tournament happening NOW (Jun-Jul 2026)'},
        {'id': 'SP027', 'rank': 2, 'level': 2, 'note': '2028 election cycle active'},
        {'id': 'SP035', 'rank': 3, 'level': 1, 'note': 'Ivanka stated "out of politics" (Dec 2024)'}
    ]

    for heating in top_3_heating:
        pred = next((p for p in data['predictions'] if p['id'] == heating['id']), None)
        if pred:
            pred['heating_rank'] = heating['rank']
            pred['heating_level'] = heating['level']
            pred['heating_note'] = heating['note']

    # Update metadata
    data['meta']['last_updated'] = datetime.now().strftime('%Y-%m-%d')
    data['meta']['status_update'] = 'All PENDING predictions updated with likelihood scores'

    # Save
    with open('data/predictions.json', 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\n{'='*80}")
    print(f"✓ Updated {len(data['predictions'])} predictions in data/predictions.json")
    print(f"{'='*80}")

if __name__ == '__main__':
    main()
