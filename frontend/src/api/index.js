/**
 * API Module - Clean interface for backend communication
 */

export { apiRequest, getConnectionStatus, subscribeToStatus, setDemoMode, isDemoMode } from './client';
export { getMatches, getFormationPairs, clearMatchCache } from './matches';
export { getScenario, preloadScenarios, isScenarioCached, clearScenarioCache } from './scenarios';
export { searchAirports, getAirportByCode, getSampleAirports } from './airports';
export { getHeatmapData, getTimeBuckets, getHeatmapStats, convertToGeoJSON } from './heatmap';
