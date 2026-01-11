/**
 * Formatting utilities for SkySync
 */

/**
 * Format number with thousands separator
 */
export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format weight in kg with appropriate unit
 */
export function formatWeight(kg) {
  if (kg === null || kg === undefined || isNaN(kg)) {
    return '-';
  }

  if (kg >= 1000) {
    return `${formatNumber(kg / 1000, 1)} t`;
  }
  return `${formatNumber(kg, 0)} kg`;
}

/**
 * Format CO2 savings
 */
export function formatCO2(kg) {
  if (kg === null || kg === undefined || isNaN(kg)) {
    return '-';
  }

  if (kg >= 1000) {
    return `${formatNumber(kg / 1000, 2)} t CO₂`;
  }
  return `${formatNumber(kg, 0)} kg CO₂`;
}

/**
 * Format fuel savings
 */
export function formatFuel(kg) {
  if (kg === null || kg === undefined || isNaN(kg)) {
    return '-';
  }

  if (kg >= 1000) {
    return `${formatNumber(kg / 1000, 2)} t`;
  }
  return `${formatNumber(kg, 0)} kg`;
}

/**
 * Format distance in km
 */
export function formatDistance(km) {
  if (km === null || km === undefined || isNaN(km)) {
    return '-';
  }
  return `${formatNumber(km, 0)} km`;
}

/**
 * Format duration in minutes
 */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return '-';
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${Math.round(minutes)}m`;
}

/**
 * Format time in seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '00:00';
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return `${formatNumber(value * 100, decimals)}%`;
}

/**
 * Format airport code with name
 */
export function formatAirport(airport) {
  if (!airport) return '-';
  if (typeof airport === 'string') return airport;
  return `${airport.code}`;
}

/**
 * Format route as origin -> destination
 */
export function formatRoute(origin, destination) {
  return `${formatAirport(origin)} → ${formatAirport(destination)}`;
}

/**
 * Format scenario name
 */
export function formatScenarioName(scenario) {
  if (!scenario) return '-';
  switch (scenario) {
    case 'conservative':
      return 'Conservative (2%)';
    case 'expected':
      return 'Expected (5%)';
    case 'optimistic':
      return 'Optimistic (7%)';
    default:
      return scenario;
  }
}

/**
 * Get savings percentage label
 */
export function getSavingsPercent(scenario) {
  switch (scenario) {
    case 'conservative':
      return '2%';
    case 'expected':
      return '5%';
    case 'optimistic':
      return '7%';
    default:
      return '5%';
  }
}
