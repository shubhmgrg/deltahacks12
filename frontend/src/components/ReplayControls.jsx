import React from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Slider } from './ui/slider';
import {
  Play,
  Pause,
  RotateCcw,
  Video,
  VideoOff,
  Fuel,
  Leaf,
  Lock,
  Unlock,
  Zap,
} from 'lucide-react';
import { formatNumber, formatCO2 } from '@/lib/utils';
import { REPLAY_STATES } from '@/lib/replay';

export default function ReplayControls({
  isPlaying,
  progress,
  phase,
  accumulatedFuel,
  accumulatedCO2,
  onPlay,
  onPause,
  onReset,
  onSeek,
  followCamera,
  onFollowCameraToggle,
  speed,
  onSpeedChange,
  isLocked,
}) {
  const getPhaseInfo = () => {
    switch (phase) {
      case REPLAY_STATES.RENDEZVOUS:
        return { label: 'ALIGNING', color: 'bg-amber-500', icon: Zap };
      case REPLAY_STATES.LOCKED:
        return { label: 'LOCKED', color: 'bg-emerald-500', icon: Lock };
      case REPLAY_STATES.SPLIT:
        return { label: 'SEPARATION', color: 'bg-blue-500', icon: Unlock };
      default:
        return { label: 'READY', color: 'bg-slate-500', icon: null };
    }
  };

  const phaseInfo = getPhaseInfo();
  const PhaseIcon = phaseInfo.icon;

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 w-auto px-4">
      <div className="bg-slate-900/90 backdrop-blur-md rounded-lg shadow-glow border border-white/10 p-5 min-w-[550px]">
        {/* Phase Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Badge
              className={`${phaseInfo.color} text-white px-3 py-1 font-mono tracking-wider border border-white/20 ${isLocked ? 'locked-badge' : ''
                }`}
            >
              {PhaseIcon && <PhaseIcon className="w-3 h-3 mr-1.5" />}
              {phaseInfo.label}
            </Badge>
            {isLocked && (
              <span className="text-xs text-emerald-400 font-mono animate-pulse">
                // FORMATION ACTIVE
              </span>
            )}
          </div>

          {/* Live Counters */}
          <div className="flex items-center gap-6 bg-slate-800/50 px-4 py-1.5 rounded-md border border-white/5">
            <div className="flex items-center gap-2 text-sm">
              <Fuel className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono font-medium text-amber-400">
                {formatNumber(Math.round(accumulatedFuel))} kg
              </span>
            </div>
            <div className="w-[1px] h-4 bg-white/10" />
            <div className="flex items-center gap-2 text-sm">
              <Leaf className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-mono font-medium text-emerald-400">
                {formatCO2(Math.round(accumulatedCO2))}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-5 px-1">
          <Slider
            value={[progress * 100]}
            onValueChange={([v]) => onSeek(v / 100)}
            min={0}
            max={100}
            step={0.5}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono tracking-wider mt-2 uppercase">
            <span>Departure</span>
            <span className="text-slate-300">{Math.round(progress * 100)}%</span>
            <span>Arrival</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <Button
              variant="default"
              size="sm"
              onClick={isPlaying ? onPause : onPlay}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-glow-sm border-0"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 ml-0.5 fill-current" />
              )}
            </Button>

            {/* Reset */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="w-10 h-10 rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-3 bg-slate-800/30 rounded-lg p-1 border border-white/5">
            <span className="text-[10px] text-slate-500 font-mono uppercase pl-2">Speed</span>
            <div className="flex gap-0.5">
              {[0.5, 1, 2, 4].map((s) => (
                <Button
                  key={s}
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs font-mono rounded ${speed === s
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-slate-500 hover:text-slate-300'
                    }`}
                  onClick={() => onSpeedChange(s)}
                >
                  {s}x
                </Button>
              ))}
            </div>
          </div>

          {/* Camera Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onFollowCameraToggle}
            className={`flex items-center gap-2 h-8 px-3 border border-transparent hover:border-white/10 hover:bg-white/5 transition-all ${followCamera ? 'text-blue-400 bg-blue-500/10 border-blue-500/20 shadow-glow-sm' : 'text-slate-500'
              }`}
          >
            {followCamera ? (
              <Video className="w-3.5 h-3.5" />
            ) : (
              <VideoOff className="w-3.5 h-3.5" />
            )}
            <span className="text-xs font-medium">CAM LOCK</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
