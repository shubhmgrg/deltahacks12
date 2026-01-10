import React from 'react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { ChevronDown, Check, Play, Wifi, WifiOff, Loader2 } from 'lucide-react';

export default function TopBar({
  activeTab,
  onTabChange,
  savingsPreset,
  onSavingsPresetChange,
  onDemoMode,
  isDemo,
  connectionStatus = 'offline',
}) {
  const presets = [
    { value: 'conservative', label: 'Conservative (2%)', rate: 0.02 },
    { value: 'expected', label: 'Expected (5%)', rate: 0.05 },
    { value: 'optimistic', label: 'Optimistic (7%)', rate: 0.07 },
  ];

  const getStatusIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-2 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
            <Wifi className="w-3 h-3" />
            CONNECTED
          </span>
        );
      case 'loading':
        return (
          <span className="text-xs font-mono text-blue-400 flex items-center gap-2 bg-blue-400/10 px-2 py-1 rounded border border-blue-400/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            SYNCING
          </span>
        );
      default:
        return (
          <span className="text-xs font-mono text-amber-500 flex items-center gap-2 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 opacity-80">
            <WifiOff className="w-3 h-3" />
            OFFLINE (MOCK)
          </span>
        );
    }
  };

  return (
    <header className="h-16 md:h-[4.5rem] lg:h-20 border-b border-white/10 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-3 md:px-4 lg:px-6 z-20 relative transition-all duration-300">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <img
          src="/transparent%20skysync.png"
          alt="SkySync"
          className="h-12 md:h-14 lg:h-16 w-auto opacity-90 hover:opacity-100 transition-all duration-300 hover:scale-105"
        />
        {isDemo && (
          <Badge variant="outline" className="text-[9px] md:text-[10px] tracking-wider border-blue-500/30 text-blue-400 bg-blue-500/10 uppercase font-mono hidden sm:inline-flex">
            Demo Mode
          </Badge>
        )}
      </div>

      {/* Center: Tabs */}
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="bg-slate-800/50 border border-white/5 transition-all duration-200">
            <TabsTrigger
              value="map"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-all duration-200 bg-transparent data-[state=active]:shadow-glow-sm text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2"
            >
              <span className="sm:hidden">Map</span>
              <span className="hidden sm:inline">Map View</span>
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-all duration-200 bg-transparent data-[state=active]:shadow-glow-sm text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2"
            >
              <span className="sm:hidden">Data</span>
              <span className="hidden sm:inline">Data View</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <div className="hidden lg:block">
          {getStatusIndicator()}
        </div>

        <Button
          variant={isDemo ? 'default' : 'outline'}
          size="sm"
          onClick={onDemoMode}
          className={`transition-all duration-200 ${isDemo
              ? 'bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow-glow-sm'
              : 'border-white/20 text-slate-300 hover:bg-white/10 hover:text-white'
            } text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2`}
        >
          <Play className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-1.5" />
          <span className="hidden sm:inline">Simulation</span>
          <span className="sm:hidden">Sim</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-white/10 bg-slate-800/50 text-slate-200 hover:bg-slate-700 hover:text-white hover:border-white/20 transition-all duration-200 text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2">
              <span className="hidden md:inline mr-2 font-mono text-xs text-slate-400">SCENARIO:</span>
              <span className="md:hidden font-mono text-xs text-slate-400 mr-1">SC:</span>
              <span className="hidden lg:inline">{presets.find((p) => p.value === savingsPreset)?.label.split('(')[0].trim()}</span>
              <span className="lg:hidden text-xs">{presets.find((p) => p.value === savingsPreset)?.label.split('(')[0].trim().substring(0, 3)}</span>
              <ChevronDown className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-900 border-white/10 text-slate-200 w-56">
            <DropdownMenuLabel className="text-slate-400 text-xs font-mono uppercase tracking-wider">Savings Scenario</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {presets.map((preset) => (
              <DropdownMenuItem
                key={preset.value}
                onClick={() => onSavingsPresetChange(preset.value)}
                className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800 transition-colors duration-150"
              >
                <div className="flex flex-col">
                  <span className={savingsPreset === preset.value ? 'font-semibold text-blue-400' : 'text-slate-300'}>
                    {preset.label.split('(')[0].trim()}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">Rate: {(preset.rate * 100).toFixed(0)}%</span>
                </div>
                {savingsPreset === preset.value && (
                  <Check className="w-4 h-4 ml-auto text-blue-400" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
