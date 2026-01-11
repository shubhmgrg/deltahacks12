#!/bin/bash
# Run the Flask backend server

echo "Starting Flight Timelapse Backend..."
echo ""

# Check if CSV file exists
CSV_FILE="data/flight_sample_2022-09-01 (1).csv"
if [ ! -f "$CSV_FILE" ]; then
    echo "Error: CSV file not found: $CSV_FILE"
    echo "Please make sure the flights CSV file exists in the data directory"
    exit 1
fi

# Run Flask app
python backend/app.py "$CSV_FILE"


