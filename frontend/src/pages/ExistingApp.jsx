import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import MapScene from '../components/MapScene';
import DataTable from '../components/DataTable';
import ReplayControls from '../components/ReplayControls';
import HeatmapControls from '../components/HeatmapControls';
import { createReplayController, REPLAY_STATES } from '../lib/replay';
import { buildPlannedPoints } from '../lib/geo';

// Import demo data (fallback)
import scenariosData from '../data/scenarios.json';
import matchesData from '../data/matches.json';

// API imports for backend-ready setup
import { getMatches, getScenario, getConnectionStatus, subscribeToStatus, setDemoMode as setApiDemoMode, isDemoMode } from '../api';
import { useSearchParams } from 'react-router-dom';

export default function ExistingApp() {
  const [searchParams] = useSearchParams();

  // Core state
  const [activeTab, setActiveTab] = useState('map');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDemo, setIsDemo] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('offline');
  const [theme, setTheme] = useState('light'); // 'light' | 'dark'

  // Data state - support both API and local fallback
  const [scenarios] = useState(scenariosData);
  const [matches, setMatches] = useState(matchesData);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [loading, setLoading] = useState(false);

  // Map mode state
  const [mapMode, setMapMode] = useState('3d'); // '3d' | '2d'
  const [routeSource, setRouteSource] = useState('tracked'); // 'tracked' | 'planned'
  const [compareMode, setCompareMode] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapMetric, setHeatmapMetric] = useState('co2');
  const [heatmapData, setHeatmapData] = useState(null);
  const [heatmapTimeBucket, setHeatmapTimeBucket] = useState(null);

  // Filter state
  const [savingsPreset, setSavingsPreset] = useState('expected');
  const [filters, setFilters] = useState({
    timeOverlap: 30,
    headingTolerance: 15,
    minFormationDuration: 60,
    maxDetour: 50,
    behindKm: 1.5,
    sideKm: 0.3,
  });

  // Query params from landing page
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const departParam = searchParams.get('depart');
  const returnParam = searchParams.get('return');
  const nearParam = searchParams.get('near');

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

  // Handle match selection
  const handleSelectMatch = useCallback((match) => {
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
  }, [scenarios]);

  // Handle replay initiation
  const handleReplayMatch = useCallback((match) => {
    handleSelectMatch(match);
    setActiveTab('map');

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
          console.log('Phase changed:', phase);
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
  }, [handleSelectMatch, scenarios, playbackSpeed]);

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

  const handleSpeedChange = useCallback((speed) => {
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
  }, [selectedScenario]);

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

  if (!appReady) {
    return (
      <div 
        className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-50 text-slate-900 transition-opacity duration-300 ${
          fadeOut ? 'opacity-0' : 'opacity-100'
        }`}
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
            
            {/* Rotating particles */}
            <div className="particle particle-1"></div>
            <div className="particle particle-2"></div>
            <div className="particle particle-3"></div>
            <div className="particle particle-4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden font-sans ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
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
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
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
            setActiveTab('map');
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
        />

        {/* Main View */}
        <main className="flex-1 relative overflow-hidden">
          {activeTab === 'map' ? (
            <>
              <MapScene
                scenarios={scenarios}
                selectedScenario={selectedScenario}
                replayState={isReplaying ? replayState : null}
                followCamera={followCamera}
                heatmapEnabled={heatmapEnabled}
                heatmapData={heatmapData}
                heatmapTimeBucket={heatmapTimeBucket}
              />

              {/* Heatmap Controls */}
              <HeatmapControls
                enabled={heatmapEnabled}
                onToggle={setHeatmapEnabled}
                onDataChange={setHeatmapData}
                onTimeBucketChange={setHeatmapTimeBucket}
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
    </div>
  );
}
