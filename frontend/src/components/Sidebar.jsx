import React, { useState, useEffect, useRef } from 'react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Switch } from './ui/switch';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './ui/accordion';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Plane,
  Fuel,
  Clock,
  Route,
  Leaf,
  MapPin,
  Activity,
  Pause,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { formatNumber, formatCO2, formatDistance, formatDuration } from '@/lib/utils';
import { getHeatmapData, getTimeBuckets, getHeatmapStats } from '../api/heatmap';

export default function Sidebar({
  isOpen,
  onToggle,
  filters,
  onFiltersChange,
  matches,
  selectedMatch,
  onSelectMatch,
  onReplayMatch,
  selectedScenario,
  savingsPreset,
  theme = 'light',
  tripParams,
  heatmapEnabled = false,
  onHeatmapToggle = null,
  onHeatmapDataChange = null,
  onHeatmapTimeBucketChange = null,
  preloadedHeatmapStats = null,
  preloadedTimeBuckets = [],
}) {
  const isDark = theme === 'dark';
  const handleFilterChange = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  // Heatmap state
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [timeBuckets, setTimeBuckets] = useState(preloadedTimeBuckets);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [interpolationProgress, setInterpolationProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState(preloadedHeatmapStats);
  const [allHeatmapData, setAllHeatmapData] = useState(null);
  const animationFrameRef = useRef(null);
  const isPlayingRef = useRef(false);

  // Load time buckets on mount (only if not preloaded)
  useEffect(() => {
    if (preloadedTimeBuckets.length === 0) {
      loadTimeBuckets();
    }
    if (!preloadedHeatmapStats) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load all heatmap data when enabled
  useEffect(() => {
    if (heatmapEnabled && timeBuckets.length > 0) {
      loadAllHeatmapData();
    } else if (!heatmapEnabled && onHeatmapDataChange) {
      onHeatmapDataChange(null);
      setAllHeatmapData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapEnabled, timeBuckets.length]);

  // Update interpolated data when time index or progress changes
  useEffect(() => {
    if (heatmapEnabled && allHeatmapData && timeBuckets.length > 0 && onHeatmapDataChange) {
      updateInterpolatedData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTimeIndex, interpolationProgress, allHeatmapData, heatmapEnabled]);

  const loadTimeBuckets = async () => {
    try {
      const buckets = await getTimeBuckets();
      setTimeBuckets(buckets);
      if (buckets.length > 0) {
        setCurrentTimeIndex(0);
      }
    } catch (error) {
      console.error('Failed to load time buckets:', error);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getHeatmapStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load heatmap stats:', error);
    }
  };

  const loadAllHeatmapData = async () => {
    setHeatmapLoading(true);
    try {
      console.log('🔍 Loading heatmap data progressively...');

      // Load data for each time bucket progressively
      const loadedData = [];
      let loadedCount = 0;

      for (const bucket of timeBuckets) {
        try {
          const data = await getHeatmapData(bucket, false);
          if (data && data.data && data.data.length > 0) {
            loadedData.push(...data.data);
            loadedCount++;

            // Update display progressively after each bucket loads
            setAllHeatmapData([...loadedData]);
            console.log(`✅ Loaded bucket ${loadedCount}/${timeBuckets.length}: ${bucket} (${data.data.length} cells)`);

            // If this is the first bucket, trigger immediate display
            if (loadedCount === 1 && onHeatmapDataChange) {
              updateInterpolatedDataWithData(loadedData);
            }
          }
        } catch (error) {
          console.error(`Failed to load bucket ${bucket}:`, error);
        }
      }

      console.log('✅ All heatmap data loaded, total cells:', loadedData.length);
    } catch (error) {
      console.error('Failed to load heatmap data:', error);
    } finally {
      setHeatmapLoading(false);
    }
  };

  const updateInterpolatedDataWithData = (data) => {
    if (!data || data.length === 0 || timeBuckets.length === 0 || !onHeatmapDataChange) return;

    const currentBucket = timeBuckets[currentTimeIndex];
    const currentBucketCells = data.filter(cell => cell.time_bucket === currentBucket);

    if (currentBucketCells.length > 0) {
      console.log(`🔄 Progressive update: showing ${currentBucketCells.length} cells for bucket ${currentBucket}`);
      onHeatmapDataChange(currentBucketCells);
    }
  };

  const updateInterpolatedData = () => {
    if (!allHeatmapData || timeBuckets.length === 0 || !onHeatmapDataChange) return;

    console.log('🔄 Updating interpolated heatmap data, time index:', currentTimeIndex);

    const currentBucket = timeBuckets[currentTimeIndex];
    const nextIndex = (currentTimeIndex + 1) % timeBuckets.length;
    const nextBucket = timeBuckets[nextIndex];
    const progress = interpolationProgress;

    console.log('📅 Current bucket:', currentBucket, '| Next bucket:', nextBucket, '| Progress:', progress);

    const currentMap = new Map();
    const nextMap = new Map();

    allHeatmapData.forEach((cell) => {
      const lat = cell.lat || cell.cell_lat;
      const lon = cell.lon || cell.cell_lon;
      const key = `${lat},${lon}`;
      if (cell.time_bucket === currentBucket) {
        currentMap.set(key, cell);
      }
      if (cell.time_bucket === nextBucket) {
        nextMap.set(key, cell);
      }
    });

    console.log('📊 Current bucket cells:', currentMap.size, '| Next bucket cells:', nextMap.size);

    const interpolatedCells = [];
    const allKeys = new Set([...currentMap.keys(), ...nextMap.keys()]);

    allKeys.forEach((key) => {
      const currentCell = currentMap.get(key);
      const nextCell = nextMap.get(key);

      if (currentCell || nextCell) {
        const currentIntensity = currentCell?.intensity || currentCell?.flight_count || 0;
        const nextIntensity = nextCell?.intensity || nextCell?.flight_count || 0;

        const easeProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const interpolatedIntensity = currentIntensity + (nextIntensity - currentIntensity) * easeProgress;

        const baseCell = currentCell || nextCell;
        interpolatedCells.push({
          ...baseCell,
          intensity: Math.max(0, interpolatedIntensity),
          flight_count: Math.round(interpolatedIntensity),
        });
      }
    });

    console.log('✅ Interpolated', interpolatedCells.length, 'heatmap cells');
    if (interpolatedCells.length > 0) {
      console.log('📝 First interpolated cell:', interpolatedCells[0]);
    }

    onHeatmapDataChange(interpolatedCells);
    if (onHeatmapTimeBucketChange) {
      onHeatmapTimeBucketChange(currentBucket);
    }
  };

  const handlePlayPause = () => {
    if (timeBuckets.length === 0) return;

    if (isPlaying) {
      isPlayingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsPlaying(false);
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);

      let bucketStartTime = Date.now();
      const duration = 1000;

      const animate = () => {
        if (!isPlayingRef.current) {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          return;
        }

        const now = Date.now();
        const elapsed = now - bucketStartTime;
        const progress = Math.min(1, elapsed / duration);

        setInterpolationProgress(progress);

        if (progress >= 1) {
          setCurrentTimeIndex((prev) => (prev + 1) % timeBuckets.length);
          setInterpolationProgress(0);
          bucketStartTime = now;
        }

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    }
  };

  const handleReset = () => {
    isPlayingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTimeIndex(0);
    setInterpolationProgress(0);
  };

  const handleTimeSliderChange = (value) => {
    const index = Math.round(value[0]);
    setCurrentTimeIndex(index);
    if (isPlaying) {
      handlePlayPause();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const savingsRates = {
    conservative: 0.02,
    expected: 0.05,
    optimistic: 0.07,
  };

  return (
    <aside
      className={`
        ${isOpen ? 'w-80' : 'w-0'}
        transition-all duration-300 ease-in-out
        ${isDark ? 'bg-slate-900/95 border-r border-white/10 text-slate-200 backdrop-blur-md' : 'bg-slate-100 border-r border-slate-200 text-slate-900'}
        flex flex-col overflow-hidden h-full z-10
      `}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`absolute left-0 top-1/2 transform -translate-y-1/2 z-10
          w-6 h-12 border border-l-0 rounded-r-md flex items-center justify-center transition-colors
          ${isDark
            ? 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        style={{ left: isOpen ? '320px' : '0px' }}
      >
        {isOpen ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Trip Summary Bar */}
          {tripParams && tripParams.from && tripParams.to && tripParams.depart && (
            <div className={`p-4 border-b ${isDark ? 'border-white/10 bg-slate-800/50' : 'border-slate-200 bg-slate-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className={`h-4 w-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} />
                <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Trip Summary</span>
              </div>
              <div className="space-y-1.5">
                <div className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <span className="font-mono">{tripParams.from}</span>
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>→</span>
                  <span className="font-mono">{tripParams.to}</span>
                </div>
                <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>
                    Depart {tripParams.depart && new Date(tripParams.depart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {tripParams.return ? (
                    <span>• Return {new Date(tripParams.return).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  ) : (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isDark ? 'border-white/15 text-slate-200 bg-white/5' : 'border-slate-300 text-slate-700 bg-white'}`}
                    >
                      One-way
                    </Badge>
                  )}
                </div>
                {tripParams.near && (
                  <div className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <MapPin className="h-3 w-3" />
                    Near {tripParams.near}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div className={`p-4 border-b ${isDark ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-slate-100'}`}>
            <h2 className={`font-semibold text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>Display Settings</h2>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Configure formation filters</p>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Filters and Heatmap Sections */}
            <Accordion type="multiple" defaultValue={["heatmap"]} className="w-full">
              <AccordionItem value="filters" className="border-b-0 px-4">
                <AccordionTrigger className={`py-3 hover:no-underline ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <span className="font-medium">Formation Filters</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-5 py-2">
                    {/* Time Overlap */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Time Overlap</span>
                        <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{filters.timeOverlap} min</span>
                      </div>
                      <Slider
                        value={[filters.timeOverlap]}
                        onValueChange={([v]) => handleFilterChange('timeOverlap', v)}
                        min={5}
                        max={120}
                        step={5}
                        className="py-1"
                        rangeClassName="bg-blue-600"
                        thumbClassName="border-blue-600 focus-visible:ring-blue-600"
                      />
                    </div>

                    {/* Heading Tolerance */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Heading Tolerance</span>
                        <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{filters.headingTolerance}°</span>
                      </div>
                      <Slider
                        value={[filters.headingTolerance]}
                        onValueChange={([v]) => handleFilterChange('headingTolerance', v)}
                        min={5}
                        max={45}
                        step={1}
                        className="py-1"
                        rangeClassName="bg-red-600"
                        thumbClassName="border-red-600 focus-visible:ring-red-600"
                      />
                    </div>

                    {/* Min Formation Duration */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Min Duration</span>
                        <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{filters.minFormationDuration} min</span>
                      </div>
                      <Slider
                        value={[filters.minFormationDuration]}
                        onValueChange={([v]) => handleFilterChange('minFormationDuration', v)}
                        min={10}
                        max={180}
                        step={5}
                        className="py-1"
                        rangeClassName="bg-green-600"
                        thumbClassName="border-green-600 focus-visible:ring-green-600"
                      />
                    </div>

                    {/* Max Detour */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Max Detour</span>
                        <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{filters.maxDetour} km</span>
                      </div>
                      <Slider
                        value={[filters.maxDetour]}
                        onValueChange={([v]) => handleFilterChange('maxDetour', v)}
                        min={0}
                        max={1000}
                        step={5}
                        className="py-1"
                        rangeClassName="bg-yellow-500"
                        thumbClassName="border-yellow-500 focus-visible:ring-yellow-500"
                      />
                    </div>

                    {/* Savings Rate Display */}
                    <div className={`pt-2 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                      <div className="flex justify-between text-sm items-center">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Savings Rate</span>
                        <Badge
                          variant="outline"
                          className={`font-mono ${isDark ? 'border-white/15 text-slate-200 bg-white/5' : 'border-slate-300 text-slate-700 bg-white'}`}
                        >
                          {(savingsRates[savingsPreset] * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Heatmap Section */}
              {onHeatmapToggle && (
                <AccordionItem value="heatmap" className="border-b-0 px-4 border-t">
                  <AccordionTrigger className={`py-3 hover:no-underline ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    <div className="flex items-center gap-2 flex-1">
                      <Activity className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                      <span className="font-medium">Heatmap</span>
                    </div>
                    <div className={isDark ? '' : 'heatmap-switch-light'}>
                      <Switch
                        checked={heatmapEnabled}
                        onCheckedChange={onHeatmapToggle}
                        onClick={(e) => e.stopPropagation()}
                        className={isDark ? '' : 'data-[state=checked]:bg-slate-500 data-[state=unchecked]:bg-slate-300'}
                      />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 py-2">
                      {/* Time Bucket Display */}
                      {timeBuckets.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Time:</span>
                            <Badge
                              variant="outline"
                              className={`text-xs font-mono ${isDark ? 'border-blue-500/30 text-blue-400' : 'border-blue-500/50 text-blue-600'}`}
                            >
                              {timeBuckets[currentTimeIndex] || '--:--'}
                            </Badge>
                          </div>

                          {/* Time Slider */}
                          <div className="space-y-1">
                            <Slider
                              value={[currentTimeIndex]}
                              min={0}
                              max={Math.max(0, timeBuckets.length - 1)}
                              step={1}
                              onValueChange={handleTimeSliderChange}
                              className="py-1"
                            />
                            <div className={`flex justify-between text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                              <span>{timeBuckets[0] || '00:00'}</span>
                              <span>{timeBuckets[timeBuckets.length - 1] || '23:59'}</span>
                            </div>
                          </div>

                          {/* Playback Controls */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handlePlayPause}
                              disabled={heatmapLoading || timeBuckets.length === 0}
                              className={`flex-1 ${isDark ? 'border-white/10 bg-slate-800/50 text-slate-200 hover:bg-slate-700 hover:text-white' : 'border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100 hover:border-slate-400'}`}
                            >
                              {isPlaying ? (
                                <>
                                  <Pause className="w-3 h-3 mr-1" />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 mr-1" />
                                  Play
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleReset}
                              disabled={heatmapLoading || timeBuckets.length === 0}
                              className={isDark ? 'border-white/10 bg-slate-800/50 text-slate-200 hover:bg-slate-700 hover:text-white' : 'border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100 hover:border-slate-400'}
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>

            {/* Best Opportunities */}
            <div className={`p-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <h3 className={`font-medium mb-3 flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <Leaf className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                Best Opportunities
              </h3>
              <div className="space-y-2">
                {matches.map((match, index) => (
                  <Card
                    key={match.scenarioId}
                    className={`
                      p-3 cursor-pointer transition-all border-l-4
                      ${selectedMatch?.scenarioId === match.scenarioId
                        ? (isDark
                          ? 'border-l-slate-300 bg-slate-800/40 border-white/10'
                          : 'border-l-slate-900 bg-white border-slate-200')
                        : (isDark
                          ? 'border-l-transparent bg-slate-900/30 border-white/10 hover:border-l-slate-500 hover:bg-slate-800/40'
                          : 'border-l-transparent bg-white border-slate-200 hover:border-l-slate-400 hover:bg-slate-50')
                      }
                    `}
                    onClick={() => onSelectMatch(match)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">#{String(index + 1).padStart(2, '0')}</span>
                          <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {match.flightA} + {match.flightB}
                          </span>
                        </div>
                        <div className={`text-xs mt-1 pl-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          {match.routeA}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 w-7 p-0 ${isDark ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-900'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplayMatch(match);
                        }}
                      >
                        <Play className={`w-3 h-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 mt-2 pl-6 text-xs">
                      <span className={`flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Clock className="w-3 h-3" />
                        <span className="font-mono">{match.formationMinutes}m</span>
                      </span>
                      <span className={`flex items-center gap-1 font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <Leaf className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                        <span className="font-mono">{formatCO2(match.co2SavedKg)}</span>
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Selected Match Detail */}
            {selectedScenario && (
              <div className={`p-4 border-t ${isDark ? 'border-white/10 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
                <h3 className={`font-medium mb-3 flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Plane className={`w-4 h-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} />
                  Match Details
                </h3>

                {/* Big Metrics */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className={`text-xl font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {formatNumber(selectedScenario?.metrics?.fuelSaved || 0)}
                    </div>
                    <div className={`text-[10px] uppercase tracking-wider flex items-center gap-1 mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Fuel className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                      kg fuel
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className={`text-xl font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {formatCO2(selectedScenario?.metrics?.co2Saved || 0)}
                    </div>
                    <div className={`text-[10px] uppercase tracking-wider flex items-center gap-1 mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Leaf className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                      CO₂ saved
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className={`text-xl font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {selectedScenario.metrics.formationMinutes}
                    </div>
                    <div className={`text-[10px] uppercase tracking-wider flex items-center gap-1 mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Clock className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                      minutes
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className={`text-xl font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {formatDistance(selectedScenario?.metrics?.detourKm || 0)}
                    </div>
                    <div className={`text-[10px] uppercase tracking-wider flex items-center gap-1 mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Route className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                      distance
                    </div>
                  </div>
                </div>

                {/* Assumptions Accordion */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="assumptions" className={`border rounded-lg ${isDark ? 'border-white/10 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                    <AccordionTrigger className={`px-3 py-2 text-sm hover:no-underline ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      Assumptions
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3">
                      <div className={`space-y-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <div className="flex justify-between">
                          <span>Savings Rate</span>
                          <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{(savingsRates[savingsPreset] * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Detour Distance</span>
                          <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedScenario.metrics.detourKm} km</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spacing (behind)</span>
                          <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>1.5 km</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spacing (side)</span>
                          <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>0.3 km</span>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Flight Info */}
                <div className="mt-4 space-y-2">
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${isDark ? 'border-white/15 text-slate-200 bg-white/5' : 'border-slate-300 text-slate-700 bg-white'}`}
                      >
                        LEADER
                      </Badge>
                      <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedScenario.leader.label}</span>
                    </div>
                    <div className={`text-xs font-mono pl-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {selectedScenario.leader.airline} • {selectedScenario.leader.aircraft}
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${isDark ? 'border-white/15 text-slate-200 bg-white/5' : 'border-slate-300 text-slate-700 bg-white'}`}
                      >
                        FOLLOWER
                      </Badge>
                      <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedScenario.follower.label}</span>
                    </div>
                    <div className={`text-xs font-mono pl-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {selectedScenario.follower.airline} • {selectedScenario.follower.aircraft}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
