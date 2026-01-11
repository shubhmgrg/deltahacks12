import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Layers, Play, Pause, RotateCcw, Clock, Zap } from 'lucide-react';
import { getHeatmapData, getTimeBuckets, getHeatmapStats, convertToGeoJSON } from '../api/heatmap';

export default function HeatmapControls({
  enabled,
  onToggle,
  onDataChange,
  onTimeBucketChange,
}) {
  const [loading, setLoading] = useState(false);
  const [timeBuckets, setTimeBuckets] = useState([]);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [interpolationProgress, setInterpolationProgress] = useState(0); // 0-1 between time buckets
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState(null);
  const [allHeatmapData, setAllHeatmapData] = useState(null); // Store all data for smooth interpolation
  const animationFrameRef = useRef(null);
  const isPlayingRef = useRef(false); // Use ref for animation loop to avoid stale closures

  // Load time buckets on mount
  useEffect(() => {
    loadTimeBuckets();
    loadStats();
  }, []);

  // Load all heatmap data when enabled (for smooth interpolation)
  useEffect(() => {
    if (enabled && timeBuckets.length > 0) {
      loadAllHeatmapData();
    } else if (!enabled && onDataChange) {
      onDataChange(null);
      setAllHeatmapData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeBuckets.length]);

  // Update interpolated data when time index or progress changes
  useEffect(() => {
    if (enabled && allHeatmapData && timeBuckets.length > 0 && onDataChange) {
      updateInterpolatedData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTimeIndex, interpolationProgress, allHeatmapData, enabled]);

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
    setLoading(true);
    try {
      // Load all data without time bucket filter
      const data = await getHeatmapData(null, false);
      if (data && data.data) {
        setAllHeatmapData(data.data);
      }
    } catch (error) {
      console.error('Failed to load heatmap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateInterpolatedData = () => {
    if (!allHeatmapData || timeBuckets.length === 0 || !onDataChange) return;

    const currentBucket = timeBuckets[currentTimeIndex];
    const nextIndex = (currentTimeIndex + 1) % timeBuckets.length;
    const nextBucket = timeBuckets[nextIndex];
    const progress = interpolationProgress; // 0-1

    // Create a map of coordinates to cells for efficient lookup
    const currentMap = new Map();
    const nextMap = new Map();

    allHeatmapData.forEach((cell) => {
      const key = `${cell.lat},${cell.lon}`;
      if (cell.time_bucket === currentBucket) {
        currentMap.set(key, cell);
      }
      if (cell.time_bucket === nextBucket) {
        nextMap.set(key, cell);
      }
    });

    // Interpolate between current and next time bucket
    const interpolatedCells = [];
    const allKeys = new Set([...currentMap.keys(), ...nextMap.keys()]);

    allKeys.forEach((key) => {
      const currentCell = currentMap.get(key);
      const nextCell = nextMap.get(key);

      if (currentCell || nextCell) {
        const currentIntensity = currentCell?.intensity || currentCell?.flight_count || 0;
        const nextIntensity = nextCell?.intensity || nextCell?.flight_count || 0;
        
        // Smooth interpolation (ease-in-out)
        const easeProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const interpolatedIntensity = currentIntensity + (nextIntensity - currentIntensity) * easeProgress;

        // Use current cell as base, or next cell if current doesn't exist
        const baseCell = currentCell || nextCell;
        interpolatedCells.push({
          ...baseCell,
          intensity: Math.max(0, interpolatedIntensity),
          flight_count: Math.round(interpolatedIntensity),
        });
      }
    });

    onDataChange(interpolatedCells);
    if (onTimeBucketChange) {
      onTimeBucketChange(currentBucket);
    }
  };

  const handlePlayPause = () => {
    if (timeBuckets.length === 0) return;

    if (isPlaying) {
      // Pause
      isPlayingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsPlaying(false);
    } else {
      // Play with smooth interpolation using requestAnimationFrame
      isPlayingRef.current = true;
      setIsPlaying(true);
      
      let bucketStartTime = Date.now();
      const duration = 500; // 0.5 second per time bucket transition (reduced for shorter trail persistence)

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
          // Move to next time bucket and reset
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
      handlePlayPause(); // Pause when manually seeking
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

  if (!enabled) {
    return (
      <Card className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-md border-white/10 p-3 shadow-lg z-10 max-w-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300 font-medium">Heatmap</span>
          </div>
          <Switch checked={enabled} onCheckedChange={(checked) => onToggle(checked)} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur-md border-white/10 p-4 shadow-xl z-10 min-w-[320px] max-w-sm">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-semibold text-white">Flight Density Heatmap</span>
          </div>
          <Switch checked={enabled} onCheckedChange={(checked) => onToggle(checked)} />
        </div>


        {/* Time Bucket Display */}
        {timeBuckets.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Time:</span>
              <Badge variant="outline" className="text-xs font-mono border-blue-500/30 text-blue-400">
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
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>{timeBuckets[0] || '00:00'}</span>
                <span>{timeBuckets[timeBuckets.length - 1] || '23:59'}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayPause}
                disabled={loading || timeBuckets.length === 0}
                className="flex-1 border-white/10 bg-slate-800/50 text-slate-200 hover:bg-slate-700 hover:text-white"
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
                disabled={loading || timeBuckets.length === 0}
                className="border-white/10 bg-slate-800/50 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}


        {/* No Data State */}
        {!loading && timeBuckets.length === 0 && (
          <div className="text-xs text-amber-500 text-center py-2">
            No heatmap data available. Run scripts/compute_heatmap.py to generate data.
          </div>
        )}
      </div>
    </Card>
  );
}

