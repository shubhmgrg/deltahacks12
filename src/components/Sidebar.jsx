import React, { useState } from 'react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
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
} from 'lucide-react';
import { formatNumber, formatCO2, formatDistance, formatDuration } from '@/lib/utils';

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
  tripParams,
  onClearAll,
}) {
  const handleFilterChange = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

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
        bg-slate-900/95 border-r border-white/10 flex flex-col overflow-hidden backdrop-blur-md
        h-full text-slate-200 z-10
      `}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10
          w-6 h-12 bg-slate-900 border border-white/10 border-l-0 rounded-r-md shadow-lg
          flex items-center justify-center hover:bg-slate-800 transition-colors text-slate-400"
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
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-cyan-600/20">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Trip Summary</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="font-mono">{tripParams.from}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono">{tripParams.to}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>
                    Depart {tripParams.depart && new Date(tripParams.depart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {tripParams.return ? (
                    <span>• Return {new Date(tripParams.return).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10">
                      One-way
                    </Badge>
                  )}
                </div>
                {tripParams.near && (
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Near {tripParams.near}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div className="p-4 border-b border-white/10 bg-slate-900/50">
            <h2 className="font-semibold text-lg text-white">Display Settings</h2>
            <p className="text-sm text-slate-400">Configure formation filters</p>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Clear All (above Formation Filters) */}
            {(selectedMatch || selectedScenario) && onClearAll && (
              <div className="px-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearAll}
                  className="w-full border-white/10 bg-slate-800/40 text-slate-100 hover:bg-slate-800"
                >
                  Clear All
                </Button>
              </div>
            )}

            {/* Filters Section */}
            <Accordion type="single" collapsible defaultValue="filters">
              <AccordionItem value="filters" className="border-b-0 px-4">
                <AccordionTrigger className="py-3 text-slate-200 hover:text-white hover:no-underline">
                  <span className="font-medium">Formation Filters</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-5 py-2">
                    {/* Time Overlap */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Time Overlap</span>
                        <span className="font-mono text-blue-400">{filters.timeOverlap} min</span>
                      </div>
                      <Slider
                        value={[filters.timeOverlap]}
                        onValueChange={([v]) => handleFilterChange('timeOverlap', v)}
                        min={5}
                        max={120}
                        step={5}
                        className="py-1"
                      />
                    </div>

                    {/* Heading Tolerance */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Heading Tolerance</span>
                        <span className="font-mono text-blue-400">{filters.headingTolerance}°</span>
                      </div>
                      <Slider
                        value={[filters.headingTolerance]}
                        onValueChange={([v]) => handleFilterChange('headingTolerance', v)}
                        min={5}
                        max={45}
                        step={1}
                        className="py-1"
                      />
                    </div>

                    {/* Min Formation Duration */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Min Duration</span>
                        <span className="font-mono text-blue-400">{filters.minFormationDuration} min</span>
                      </div>
                      <Slider
                        value={[filters.minFormationDuration]}
                        onValueChange={([v]) => handleFilterChange('minFormationDuration', v)}
                        min={10}
                        max={180}
                        step={5}
                        className="py-1"
                      />
                    </div>

                    {/* Max Detour */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Max Detour</span>
                        <span className="font-mono text-blue-400">{filters.maxDetour} km</span>
                      </div>
                      <Slider
                        value={[filters.maxDetour]}
                        onValueChange={([v]) => handleFilterChange('maxDetour', v)}
                        min={0}
                        max={100}
                        step={5}
                        className="py-1"
                      />
                    </div>

                    {/* Savings Rate Display */}
                    <div className="pt-2 border-t border-white/10">
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-400">Savings Rate</span>
                        <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 font-mono">
                          {(savingsRates[savingsPreset] * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Best Opportunities */}
            <div className="p-4 border-t border-white/10">
              <h3 className="font-medium mb-3 flex items-center gap-2 text-white">
                <Leaf className="w-4 h-4 text-emerald-500" />
                Best Opportunities
              </h3>
              <div className="space-y-2">
                {matches.map((match, index) => (
                  <Card
                    key={match.scenarioId}
                    className={`
                      p-3 cursor-pointer transition-all border-l-4
                      ${selectedMatch?.scenarioId === match.scenarioId
                        ? 'border-l-blue-500 bg-blue-500/10 border-t-white/5 border-r-white/5 border-b-white/5'
                        : 'border-l-transparent bg-slate-800/50 border-white/5 hover:border-l-slate-600 hover:bg-slate-800'
                      }
                    `}
                    onClick={() => onSelectMatch(match)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">#{String(index + 1).padStart(2, '0')}</span>
                          <span className="font-semibold text-sm text-slate-200">
                            {match.flightA} + {match.flightB}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 pl-6">
                          {match.routeA}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 hover:bg-white/10 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplayMatch(match);
                        }}
                      >
                        <Play className="w-3 h-3 text-blue-400" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 mt-2 pl-6 text-xs">
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span className="font-mono">{match.formationMinutes}m</span>
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <Leaf className="w-3 h-3" />
                        <span className="font-mono">{formatCO2(match.co2SavedKg)}</span>
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Selected Match Detail */}
            {selectedScenario && (
              <div className="p-4 border-t border-white/10 bg-slate-900/80 backdrop-blur-sm">
                <h3 className="font-medium mb-3 flex items-center gap-2 text-white">
                  <Plane className="w-4 h-4 text-blue-400" />
                  Match Details
                </h3>

                {/* Big Metrics */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <div className="text-xl font-bold font-mono text-emerald-400">
                      {formatNumber(selectedScenario.metrics.fuelSavedKg)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1 mt-1">
                      <Fuel className="w-3 h-3" />
                      kg fuel
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <div className="text-xl font-bold font-mono text-emerald-400">
                      {formatCO2(selectedScenario.metrics.co2SavedKg)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1 mt-1">
                      <Leaf className="w-3 h-3" />
                      CO₂ saved
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <div className="text-xl font-bold font-mono text-blue-400">
                      {selectedScenario.metrics.formationMinutes}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      minutes
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <div className="text-xl font-bold font-mono text-blue-400">
                      {formatDistance(selectedScenario.metrics.formationDistanceKm)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1 mt-1">
                      <Route className="w-3 h-3" />
                      distance
                    </div>
                  </div>
                </div>

                {/* Assumptions Accordion */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="assumptions" className="border border-white/10 rounded-lg bg-slate-800/30">
                    <AccordionTrigger className="px-3 py-2 text-sm text-slate-300 hover:text-white hover:no-underline">
                      Assumptions
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3">
                      <div className="space-y-2 text-xs text-slate-400">
                        <div className="flex justify-between">
                          <span>Savings Rate</span>
                          <span className="text-slate-200 font-mono">{(savingsRates[savingsPreset] * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Detour Distance</span>
                          <span className="text-slate-200 font-mono">{selectedScenario.metrics.detourKm} km</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spacing (behind)</span>
                          <span className="text-slate-200 font-mono">1.5 km</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spacing (side)</span>
                          <span className="text-slate-200 font-mono">0.3 km</span>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Flight Info */}
                <div className="mt-4 space-y-2">
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10">LEADER</Badge>
                      <span className="font-semibold text-sm text-white">{selectedScenario.leader.label}</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono pl-1">
                      {selectedScenario.leader.airline} • {selectedScenario.leader.aircraft}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-400 bg-indigo-500/10">FOLLOWER</Badge>
                      <span className="font-semibold text-sm text-white">{selectedScenario.follower.label}</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono pl-1">
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
