import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import MapScene from '../components/MapScene';
import DataTable from '../components/DataTable';
import ReplayControls from '../components/ReplayControls';
import AgentChat from '../components/AgentChat';
import { createReplayController, REPLAY_STATES } from '../lib/replay';
import { buildPlannedPoints } from '../lib/geo';

// Import demo data (fallback)
import scenariosData from "../data/scenarios.json";
import matchesData from "../data/matches.json";

// API imports for backend-ready setup
import {
  getMatches,
  getFormationPairs, // Added import
  getScenario,
  getConnectionStatus,
  subscribeToStatus,
  setDemoMode as setApiDemoMode,
  isDemoMode,
  getTimeBuckets,
  getHeatmapStats,
} from "../api";
import { useSearchParams } from "react-router-dom";

export default function ExistingApp() {
  const [searchParams] = useSearchParams();

  // Core state
  const [activeTab, setActiveTab] = useState("map");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDemo, setIsDemo] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [theme, setTheme] = useState("light"); // 'light' | 'dark'

  // Data state - support both API and local fallback
  const [scenarios, setScenarios] = useState([]);
  const [matches, setMatches] = useState(matchesData);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load scenarios from JSON file
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const response = await fetch('/src/data/scenarios.json');
        const data = await response.json();
        setScenarios(data);
        console.log('Loaded scenarios from file:', data.length);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
        // Fallback to imported data
        setScenarios(scenariosData);
      }
    };
    loadScenarios();
  }, []);

  // Map mode state
  const [mapMode, setMapMode] = useState("3d"); // '3d' | '2d'
  const [routeSource, setRouteSource] = useState("tracked"); // 'tracked' | 'planned'
  const [compareMode, setCompareMode] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapMetric, setHeatmapMetric] = useState("co2");
  const [heatmapData, setHeatmapData] = useState(null);
  const [heatmapTimeBucket, setHeatmapTimeBucket] = useState(null);
  const [preloadedHeatmapStats, setPreloadedHeatmapStats] = useState(null);
  const [preloadedTimeBuckets, setPreloadedTimeBuckets] = useState([]);

  // Filter state
  const [savingsPreset, setSavingsPreset] = useState("expected");
  const [filters, setFilters] = useState({
    timeOverlap: 30,
    headingTolerance: 15,
    minFormationDuration: 60,
    maxDetour: 500,
    behindKm: 1.5,
    sideKm: 0.3,
  });

  // Query params from landing page
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const departParam = searchParams.get("depart");
  const returnParam = searchParams.get("return");
  const nearParam = searchParams.get("near");

  // Subscribe to connection status
  useEffect(() => {
    const unsubscribe = subscribeToStatus(setConnectionStatus);
    return unsubscribe;
  }, []);

  // Replay state
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayState, setReplayState] = useState({
    isPlaying: false,
    progress: 0,
    phase: REPLAY_STATES.IDLE,
    leaderPosition: null,
    followerPosition: null,
    accumulatedFuel: 0,
    accumulatedCO2: 0,
    isLocked: false,
    showConnector: false,
  });
  const [followCamera, setFollowCamera] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Replay controller ref
  const replayController = useRef(null);
  const isInitialMount = useRef(true);
  const previousFilters = useRef({
    timeOverlap: 30,
    headingTolerance: 15,
    minFormationDuration: 60,
    maxDetour: 500,
  });

  // Handle match selection
  const handleSelectMatch = useCallback(
    (match) => {
      setSelectedMatch(match);
      const scenario = scenarios.find((s) => s.id === match.scenarioId);
      setSelectedScenario(scenario);

      // Stop any existing replay
      if (replayController.current) {
        replayController.current.stop();
        replayController.current.destroy();
        replayController.current = null;
      }

      setReplayState({
        isPlaying: false,
        progress: 0,
        phase: REPLAY_STATES.IDLE,
        leaderPosition: null,
        followerPosition: null,
        accumulatedFuel: 0,
        accumulatedCO2: 0,
        isLocked: false,
        showConnector: false,
      });
      setIsReplaying(false);
    },
    [scenarios]
  );

  // Handle replay initiation
  const handleReplayMatch = useCallback(
    (match) => {
      handleSelectMatch(match);
      setActiveTab("map");

      // Small delay to ensure scenario is loaded
      setTimeout(() => {
        const scenario = scenarios.find((s) => s.id === match.scenarioId);
        if (!scenario) return;

        // Clean up existing controller
        if (replayController.current) {
          replayController.current.destroy();
        }

        // Create new replay controller
        replayController.current = createReplayController(scenario, {
          speedMultiplier: playbackSpeed,
          onUpdate: (state) => {
            setReplayState(state);
          },
          onPhaseChange: (phase) => {
            console.log("Phase changed:", phase);
          },
          onComplete: () => {
            setReplayState((prev) => ({
              ...prev,
              isPlaying: false,
            }));
          },
        });

        setIsReplaying(true);
        replayController.current.play();
      }, 100);
    },
    [handleSelectMatch, scenarios, playbackSpeed]
  );

  // Replay controls
  const handlePlay = useCallback(() => {
    if (replayController.current) {
      replayController.current.play();
    } else if (selectedScenario) {
      // Create new controller if needed
      replayController.current = createReplayController(selectedScenario, {
        speedMultiplier: playbackSpeed,
        onUpdate: setReplayState,
        onComplete: () => {
          setReplayState((prev) => ({ ...prev, isPlaying: false }));
        },
      });
      setIsReplaying(true);
      replayController.current.play();
    }
  }, [selectedScenario, playbackSpeed]);

  const handlePause = useCallback(() => {
    if (replayController.current) {
      replayController.current.pause();
    }
  }, []);

  const handleReset = useCallback(() => {
    if (replayController.current) {
      replayController.current.stop();
      setReplayState({
        isPlaying: false,
        progress: 0,
        phase: REPLAY_STATES.IDLE,
        leaderPosition: null,
        followerPosition: null,
        accumulatedFuel: 0,
        accumulatedCO2: 0,
        isLocked: false,
        showConnector: false,
      });
    }
  }, []);

  const handleSeek = useCallback((progress) => {
    if (replayController.current) {
      replayController.current.seek(progress);
    }
  }, []);

  const handleSpeedChange = useCallback(
    (speed) => {
      setPlaybackSpeed(speed);
      // Recreate controller with new speed if currently replaying
      if (replayController.current && selectedScenario) {
        const wasPlaying = replayController.current.isPlaying();
        const currentProgress = replayController.current.getState().progress;

        replayController.current.destroy();
        replayController.current = createReplayController(selectedScenario, {
          speedMultiplier: speed,
          onUpdate: setReplayState,
          onComplete: () => {
            setReplayState((prev) => ({ ...prev, isPlaying: false }));
          },
        });

        replayController.current.seek(currentProgress);
        if (wasPlaying) {
          replayController.current.play();
        }
      }
    },
    [selectedScenario]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (replayController.current) {
        replayController.current.destroy();
      }
    };
  }, []);

  // Startup loading state
  const [appReady, setAppReady] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Preload heatmap data during loading screen
    const preloadHeatmapData = async () => {
      try {
        // Preload time buckets and stats
        const [buckets, stats] = await Promise.all([
          getTimeBuckets().catch(() => []),
          getHeatmapStats().catch(() => null),
        ]);

        if (buckets && buckets.length > 0) {
          setPreloadedTimeBuckets(buckets);
        }
        if (stats) {
          setPreloadedHeatmapStats(stats);
        }
      } catch (error) {
        // Silently fail - data will load when needed
      }
    };

    preloadHeatmapData();

    // Simulate initialization time or wait for resources
    const timer = setTimeout(() => {
      setFadeOut(true);
      // Wait for fade out animation to complete
      setTimeout(() => {
        setAppReady(true);
      }, 300);
    }, 2500); // 2.5s loading screen
    return () => clearTimeout(timer);
  }, []);

  // Demo mode toggle
  const handleDemoMode = useCallback(() => {
    setIsDemo(true);
    // Select first match for demo
    if (matches.length > 0 && !selectedMatch) {
      handleSelectMatch(matches[0]);
    }
  }, [matches, selectedMatch, handleSelectMatch]);

  // Live Backend Integration with proper debouncing
  useEffect(() => {
    // Check if filters have actually changed
    const hasChanged = 
      previousFilters.current.timeOverlap !== filters.timeOverlap ||
      previousFilters.current.headingTolerance !== filters.headingTolerance ||
      previousFilters.current.minFormationDuration !== filters.minFormationDuration ||
      previousFilters.current.maxDetour !== filters.maxDetour;

    // Skip initial mount to prevent automatic fetch
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousFilters.current = {
        timeOverlap: filters.timeOverlap,
        headingTolerance: filters.headingTolerance,
        minFormationDuration: filters.minFormationDuration,
        maxDetour: filters.maxDetour,
      };
      console.log('Skipping initial fetch - waiting for user filter changes');
      return;
    }

    // Skip if no actual change
    if (!hasChanged) {
      console.log('Filters unchanged, skipping fetch');
      return;
    }

    // Update previous filters
    previousFilters.current = {
      timeOverlap: filters.timeOverlap,
      headingTolerance: filters.headingTolerance,
      minFormationDuration: filters.minFormationDuration,
      maxDetour: filters.maxDetour,
    };

    const fetchLivePairs = async () => {
      setLoading(true);
      try {
        console.log("Fetching formation pairs...", filters);
        const data = await getFormationPairs(filters);

        if (data && data.pairs) {
          const transformed = data.pairs.map((p, idx) => ({
            scenarioId: `pair_${p.flight1_id}_${p.flight2_id}`,
            rank: idx + 1,
            flightA: p.flight1_label || p.flight1_id,
            flightB: p.flight2_label || p.flight2_id,
            routeA: `Route ${p.flight1_label || p.flight1_id}`,
            formationMinutes: Math.round(parseFloat(p.overlap_duration_min || 0)),
            co2SavedKg: Math.round(parseFloat(p.overlap_duration_min || 0) * 12),
            fuelSavedKg: Math.round(parseFloat(p.overlap_duration_min || 0) * 3.8),
            detourKm: parseFloat(p.detour_km || 0),
            score: 95 - (parseFloat(p.detour_km || 0) * 0.1),
            // Preserve raw data
            ...p
          }));

          setMatches(transformed);
          
          // Reload scenarios from file after backend updates it
          setTimeout(async () => {
            try {
              const response = await fetch('/src/data/scenarios.json?t=' + Date.now());
              const scenariosData = await response.json();
              setScenarios(scenariosData);
              console.log('Reloaded scenarios after fetch:', scenariosData.length);
            } catch (error) {
              console.error('Failed to reload scenarios:', error);
            }
          }, 500);
        }
      } catch (err) {
        console.error("Failed to fetch pairs:", err);
      } finally {
        setLoading(false);
      }
    };

    // Debounce: only fetch after 1 second of no filter changes
    const t = setTimeout(fetchLivePairs, 1000);
    return () => clearTimeout(t);
  }, [filters.timeOverlap, filters.headingTolerance, filters.minFormationDuration, filters.maxDetour, filters]);

  if (!appReady) {
    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center text-slate-900 transition-opacity duration-300 ${fadeOut ? "opacity-0" : "opacity-100"
          }`}
        style={{
          backgroundColor: theme === "dark" ? "#020617" : "#f8fafc",
          color: theme === "dark" ? "#f8fafc" : "#0f172a",
        }}
      >
        <div className="loading-screen-wrapper">
          <div className="loading-container">
            {/* Animated glow rings */}
            <div className="glow-ring glow-ring-1"></div>
            <div className="glow-ring glow-ring-2"></div>
            <div className="glow-ring glow-ring-3"></div>

            {/* Main logo */}
            <img
              src="/transparent%20skysync.png"
              alt="SkySync Loading..."
              className="loading-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden font-sans ${theme === "dark"
        ? "bg-slate-950 text-slate-100"
        : "bg-slate-50 text-slate-900"
        }`}
    >
      {/* Top Bar */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        savingsPreset={savingsPreset}
        onSavingsPresetChange={setSavingsPreset}
        onDemoMode={handleDemoMode}
        isDemo={isDemo}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          filters={filters}
          onFiltersChange={setFilters}
          matches={matches}
          selectedMatch={selectedMatch}
          onSelectMatch={(match) => {
            handleSelectMatch(match);
            setActiveTab("map");
          }}
          onReplayMatch={handleReplayMatch}
          selectedScenario={selectedScenario}
          savingsPreset={savingsPreset}
          theme={theme}
          tripParams={{
            from: fromParam,
            to: toParam,
            depart: departParam,
            return: returnParam,
            near: nearParam,
          }}
          heatmapEnabled={heatmapEnabled}
          onHeatmapToggle={setHeatmapEnabled}
          onHeatmapDataChange={setHeatmapData}
          onHeatmapTimeBucketChange={setHeatmapTimeBucket}
          preloadedHeatmapStats={preloadedHeatmapStats}
          preloadedTimeBuckets={preloadedTimeBuckets}
        />

        {/* Main View */}
        <main className="flex-1 relative overflow-hidden">
          {activeTab === "map" ? (
            <>
              <MapScene
                scenarios={scenarios}
                selectedScenario={selectedScenario}
                replayState={isReplaying ? replayState : null}
                followCamera={followCamera}
                heatmapEnabled={heatmapEnabled}
                heatmapData={heatmapData}
                heatmapTimeBucket={heatmapTimeBucket}
                theme={theme}
              />

              {/* Replay Controls - only show when scenario is selected */}
              {selectedScenario && (
                <ReplayControls
                  isPlaying={replayState.isPlaying}
                  progress={replayState.progress}
                  phase={replayState.phase}
                  accumulatedFuel={replayState.accumulatedFuel}
                  accumulatedCO2={replayState.accumulatedCO2}
                  isLocked={replayState.isLocked}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onReset={handleReset}
                  onSeek={handleSeek}
                  followCamera={followCamera}
                  onFollowCameraToggle={() => setFollowCamera(!followCamera)}
                  speed={playbackSpeed}
                  onSpeedChange={handleSpeedChange}
                  theme={theme}
                />
              )}
            </>
          ) : (
            <DataTable
              matches={matches}
              selectedMatch={selectedMatch}
              onSelectMatch={(match) => {
                handleSelectMatch(match);
              }}
              onReplayMatch={handleReplayMatch}
              theme={theme}
            />
          )}
        </main>
      </div>

      {/* AI Agent Chat Window */}
      <AgentChat />
    </div>
  );
}
