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
import { ChevronDown, Check } from 'lucide-react';

export default function TopBar({
  activeTab,
  onTabChange,
  savingsPreset,
  onSavingsPresetChange,
  // Removed: Simulation button
  // Removed: connection status badge ("OFFLINE (MOCK)")
  // Removed: theme toggle button
}) {
  const isDark = false;
  const presets = [
    { value: 'conservative', label: 'Conservative (2%)', rate: 0.02 },
    { value: 'expected', label: 'Expected (5%)', rate: 0.05 },
    { value: 'optimistic', label: 'Optimistic (7%)', rate: 0.07 },
  ];

  return (
    <header
      className={`h-16 md:h-[4.5rem] lg:h-20 border-b backdrop-blur-md flex items-center justify-between px-3 md:px-4 lg:px-6 z-20 relative transition-all duration-300 ${
        isDark ? 'border-white/10 bg-slate-900/80' : 'border-slate-200/80 bg-slate-100/90'
      }`}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <img
          src="/transparent%20skysync.png"
          alt="SkySync"
          className="h-12 md:h-14 lg:h-16 w-auto opacity-90 hover:opacity-100 transition-all duration-300 hover:scale-105"
        />
      </div>

      {/* Center: Tabs */}
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList
            className={`transition-all duration-200 ${
              isDark ? 'bg-slate-800/60 border border-white/10' : 'bg-white border border-slate-200'
            }`}
          >
            <TabsTrigger
              value="map"
              className={`transition-all duration-200 bg-transparent text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 ${
                isDark
                  ? 'data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300 hover:text-white'
                  : 'data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="sm:hidden">Map</span>
              <span className="hidden sm:inline">Map View</span>
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className={`transition-all duration-200 bg-transparent text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 ${
                isDark
                  ? 'data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300 hover:text-white'
                  : 'data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="sm:hidden">Data</span>
              <span className="hidden sm:inline">Data View</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`transition-all duration-200 text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2 ${
                isDark
                  ? 'border-white/10 bg-slate-800/60 text-slate-100 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className={`hidden md:inline mr-2 font-mono text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>SCENARIO:</span>
              <span className={`md:hidden font-mono text-xs mr-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>SC:</span>
              <span className="hidden lg:inline">{presets.find((p) => p.value === savingsPreset)?.label.split('(')[0].trim()}</span>
              <span className="lg:hidden text-xs">{presets.find((p) => p.value === savingsPreset)?.label.split('(')[0].trim().substring(0, 3)}</span>
              <ChevronDown className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={`w-56 ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
          >
            <DropdownMenuLabel className={`text-xs font-mono uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Savings Scenario
            </DropdownMenuLabel>
            <DropdownMenuSeparator className={isDark ? 'bg-white/10' : 'bg-slate-200'} />
            {presets.map((preset) => (
              <DropdownMenuItem
                key={preset.value}
                onClick={() => onSavingsPresetChange(preset.value)}
                className={`cursor-pointer transition-colors duration-150 ${
                  isDark ? 'hover:bg-slate-800 focus:bg-slate-800' : 'hover:bg-slate-100 focus:bg-slate-100'
                }`}
              >
                <div className="flex flex-col">
                  <span
                    className={
                      savingsPreset === preset.value
                        ? `font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`
                        : isDark
                          ? 'text-slate-200'
                          : 'text-slate-700'
                    }
                  >
                    {preset.label.split('(')[0].trim()}
                  </span>
                  <span className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Rate: {(preset.rate * 100).toFixed(0)}%
                  </span>
                </div>
                {savingsPreset === preset.value && (
                  <Check className={`w-4 h-4 ml-auto ${isDark ? 'text-white' : 'text-slate-900'}`} />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
