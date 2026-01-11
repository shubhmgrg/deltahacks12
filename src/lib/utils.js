import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format number with commas
 */
export function formatNumber(num, decimals = 0) {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format CO2 value (kg or tonnes)
 */
export function formatCO2(kg) {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2)} t`;
  }
  return `${Math.round(kg)} kg`;
}

/**
 * Format distance (km or m)
 */
export function formatDistance(km) {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Format duration in minutes
 */
export function formatDuration(minutes) {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

/**
 * Calculate savings score for ranking
 */
export function calculateScore(metrics, savingsRate = 0.05) {
  const { formationMinutes, co2SavedKg, detourKm } = metrics;
  // Score = CO2 saved - penalty for detour
  const detourPenalty = detourKm * 0.5; // kg CO2 per km detour
  return co2SavedKg - detourPenalty;
}
