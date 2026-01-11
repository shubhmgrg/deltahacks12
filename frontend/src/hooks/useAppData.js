/**
 * Main application data hook
 * Manages matches, scenarios, filters, and UI state
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getMatches, getScenario, getConnectionStatus, subscribeToStatus, setDemoMode, isDemoMode } from '../api';
import { buildPlannedPoints, findClosestApproachIndex } from '../lib/geo';

const SCENARIOS = {
  conservative: { rate: 0.02, label: 'Conservative (2%)' },
  expected: { rate: 0.05, label: 'Expected (5%)' },
  optimistic: { rate: 0.07, label: 'Optimistic (7%)' },
};

export function useAppData() {
  // Connection status
  const [connectionStatus, setConnectionStatus] = useState(getConnectionStatus());
  const [demoMode, setDemoModeState] = useState(isDemoMode());

  // Data state
  const [matches, setMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [loadedScenario, setLoadedScenario] = useState(null);
  const [plannedRoutes, setPlannedRoutes] = useState({ leader: null, follower: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [filters, setFilters] = useState({
    scenario: 'expected',
    timeOverlapMin: 30,
    headingToleranceDeg: 15,
    minFormationMin: 20,
    maxDetourKm: 150,
    behindKm: 1.5,
    sideKm: 0.3,
  });

  // View state
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'data'
  const [mapMode, setMapMode] = useState('3d'); // '3d' | '2d'
  const [routeSource, setRouteSource] = useState('tracked'); // 'tracked' | 'planned'
  const [compareMode, setCompareMode] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapMetric, setHeatmapMetric] = useState('co2'); // 'co2' | 'fuel' | 'density'
  const [followCamera, setFollowCamera] = useState(true);

  // Abort controller for canceling requests
  const abortControllerRef = useRef(null);

  // Subscribe to connection status changes
  useEffect(() => {
    const unsubscribe = subscribeToStatus(setConnectionStatus);
    return unsubscribe;
  }, []);

  // Load matches on mount
  useEffect(() => {
    loadMatches();
  }, []);

  // Load matches
  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMatches({ scenario: filters.scenario });
      setMatches(data.matches || []);

      // Auto-select first match if none selected
      if (data.matches?.length > 0 && !selectedMatchId) {
        setSelectedMatchId(data.matches[0].id);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        console.error('Failed to load matches:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [filters.scenario, selectedMatchId]);

  // Load scenario when match is selected
  useEffect(() => {
    if (!selectedMatchId) {
      setLoadedScenario(null);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const loadScenario = async () => {
      try {
        const scenario = await getScenario(selectedMatchId, controller.signal);
        setLoadedScenario(scenario);

        // Build planned routes from origin/destination
        if (scenario) {
          const leaderDuration = scenario.leader.points[scenario.leader.points.length - 1]?.t || 3600;
          const followerDuration = scenario.follower.points[scenario.follower.points.length - 1]?.t || 3600;

          const plannedLeader = buildPlannedPoints(
            scenario.leader.origin,
            scenario.leader.destination,
            leaderDuration,
            60
          );

          const plannedFollower = buildPlannedPoints(
            scenario.follower.origin,
            scenario.follower.destination,
            followerDuration,
            60
          );

          // Add join/split indices for planned routes based on closest approach
          setPlannedRoutes({
            leader: plannedLeader,
            follower: plannedFollower,
            joinIndex: scenario.joinIndex,
            splitIndex: scenario.splitIndex,
          });
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to load scenario:', err);
        }
      }
    };

    loadScenario();

    return () => {
      controller.abort();
    };
  }, [selectedMatchId]);

  // Toggle demo mode
  const toggleDemoMode = useCallback((enabled) => {
    setDemoMode(enabled);
    setDemoModeState(enabled);
    // Reload matches after toggling
    loadMatches();
  }, [loadMatches]);

  // Update filter
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Select match
  const selectMatch = useCallback((matchId) => {
    setSelectedMatchId(matchId);
  }, []);

  // Get selected match
  const selectedMatch = useMemo(() => {
    return matches.find(m => m.id === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  // Adjust metrics based on scenario
  const adjustedMetrics = useMemo(() => {
    if (!selectedMatch?.metrics) return null;

    const baseRate = 0.05; // Base rate in the data
    const targetRate = SCENARIOS[filters.scenario]?.rate || 0.05;
    const multiplier = targetRate / baseRate;

    return {
      ...selectedMatch.metrics,
      fuelSavedKg: selectedMatch.metrics.fuelSavedKg * multiplier,
      co2SavedKg: selectedMatch.metrics.co2SavedKg * multiplier,
    };
  }, [selectedMatch, filters.scenario]);

  return {
    // Status
    connectionStatus,
    demoMode,
    loading,
    error,

    // Data
    matches,
    selectedMatch,
    selectedMatchId,
    loadedScenario,
    plannedRoutes,
    adjustedMetrics,

    // Filters
    filters,
    scenarios: SCENARIOS,

    // View state
    activeTab,
    mapMode,
    routeSource,
    compareMode,
    heatmapEnabled,
    heatmapMetric,
    followCamera,

    // Actions
    toggleDemoMode,
    updateFilter,
    selectMatch,
    setActiveTab,
    setMapMode,
    setRouteSource,
    setCompareMode,
    setHeatmapEnabled,
    setHeatmapMetric,
    setFollowCamera,
    loadMatches,
  };
}
