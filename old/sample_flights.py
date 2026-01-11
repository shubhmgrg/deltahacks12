import pandas as pd
import random

# Configuration
INPUT_FILE = 'data/flights.csv'
BACKUP_FILE = 'data/flights_backup.csv'
KEEP_PERCENTAGE = 0.6  # Keep 60% (remove 40%)

print("="*60)
print("Sampling Flights - Reducing by 40% (keeping 60%)")
print("="*60)

# Load flights
print(f"\nLoading {INPUT_FILE}...")
df = pd.read_csv(INPUT_FILE)
total_flights = len(df)
print(f"Total flights: {total_flights:,}")

# Create backup
print(f"\nCreating backup to {BACKUP_FILE}...")
df.to_csv(BACKUP_FILE, index=False)
print("✓ Backup created")

# Sample flights (keep 60%)
keep_count = int(total_flights * KEEP_PERCENTAGE)
print(f"\nSampling {keep_count:,} flights ({KEEP_PERCENTAGE*100:.1f}% of original)...")
sampled_df = df.sample(n=keep_count, random_state=42)  # random_state for reproducibility

# Sort by id to maintain order
sampled_df = sampled_df.sort_values('id').reset_index(drop=True)

# Save sampled flights (overwrite original)
print(f"Saving {len(sampled_df):,} flights to {INPUT_FILE}...")
sampled_df.to_csv(INPUT_FILE, index=False)
print("✓ Saved sampled flights")

# Statistics
print(f"\n" + "="*60)
print("Sampling Complete!")
print("="*60)
print(f"Original flights: {total_flights:,}")
print(f"Sampled flights: {len(sampled_df):,}")
print(f"Removed: {total_flights - len(sampled_df):,} flights ({(1 - len(sampled_df)/total_flights)*100:.1f}%)")
print(f"\nBackup saved to: {BACKUP_FILE}")
print(f"Original file updated: {INPUT_FILE}")

# Estimate node reduction
# Average nodes per flight is roughly 28 (from earlier stats)
avg_nodes_per_flight = 28
original_nodes = total_flights * avg_nodes_per_flight
sampled_nodes = len(sampled_df) * avg_nodes_per_flight
print(f"\nEstimated node reduction:")
print(f"  Original nodes: ~{original_nodes:,.0f}")
print(f"  Sampled nodes: ~{sampled_nodes:,.0f}")
print(f"  Reduction: ~{(1 - sampled_nodes/original_nodes)*100:.1f}%")

