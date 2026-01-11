"""
Download flight data from OpenSky Network API or CSV.

For MVP, we'll use a simple approach to get state vector data.
"""

import requests
import pandas as pd
import argparse
from pathlib import Path
from datetime import datetime, timedelta


def download_opensky_csv(output_file='data/flights.csv', hours=2):
    """
    Download flight data from OpenSky Network.
    
    Note: OpenSky has rate limits. For MVP, use their CSV exports or
    generate synthetic data instead.
    """
    print("OpenSky Network API requires authentication for historical data.")
    print("For MVP, use synthetic data generator instead:")
    print("  python scripts/generate_sample.py")
    print("\nOr download CSV from OpenSky directly:")
    print("  https://opensky-network.org/datasets/states/")
    
    # Placeholder for future API integration
    # For now, recommend using generate_sample.py
    return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download flight data')
    parser.add_argument('--output', default='data/flights.csv', help='Output CSV file')
    parser.add_argument('--hours', type=int, default=2, help='Hours of data to download')
    
    args = parser.parse_args()
    
    download_opensky_csv(args.output, args.hours)


