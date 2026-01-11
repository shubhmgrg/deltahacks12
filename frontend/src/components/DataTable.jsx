import React, { useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Play,
  Leaf,
  Fuel,
  Clock,
  Route,
} from 'lucide-react';
import { formatNumber, formatCO2, formatDistance } from '@/lib/utils';

export default function DataTable({
  matches,
  selectedMatch,
  onSelectMatch,
  onReplayMatch,
  theme = 'light',
}) {
  const isDark = theme === 'dark';
  const [sortConfig, setSortConfig] = useState({
    key: 'rank',
    direction: 'asc',
  });

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedMatches = [...matches].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    return aVal > bVal ? direction : -direction;
  });

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) {
      return <ArrowUpDown className="w-4 h-4 ml-1 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-4 h-4 ml-1 text-blue-500" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1 text-blue-500" />
    );
  };

  const columns = [
    { key: 'rank', label: 'Rank', icon: null },
    { key: 'flightA', label: 'Leader', icon: null },
    { key: 'flightB', label: 'Follower', icon: null },
    { key: 'routeA', label: 'Route', icon: Route },
    { key: 'formationMinutes', label: 'Duration', icon: Clock },
    { key: 'co2SavedKg', label: 'CO₂ Saved', icon: Leaf },
    { key: 'fuelSavedKg', label: 'Fuel Saved', icon: Fuel },
    { key: 'detourKm', label: 'Detour', icon: Route },
    { key: 'score', label: 'Score', icon: null },
  ];

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'}`}>
      {/* Header */}
      <div className={`p-4 border-b ${isDark ? 'border-white/10' : ''}`}>
        <h2 className="text-xl font-semibold">Formation Opportunities</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
          Ranked list of potential formation flight pairings. Click to select, then switch to Map View.
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className={`${isDark ? 'bg-slate-900 sticky top-0' : 'bg-gray-50 sticky top-0'}`}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-sm font-medium cursor-pointer transition-colors ${
                    isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center">
                    {col.icon && <col.icon className={`w-4 h-4 mr-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />}
                    {col.label}
                    <SortIcon column={col.key} />
                  </div>
                </th>
              ))}
              <th className={`px-4 py-3 text-left text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedMatches.map((match) => (
              <tr
                key={match.scenarioId}
                className={`
                  border-b cursor-pointer transition-colors
                  ${selectedMatch?.scenarioId === match.scenarioId
                    ? (isDark ? 'bg-slate-900/60 hover:bg-slate-900' : 'bg-blue-50 hover:bg-blue-100')
                    : (isDark ? 'hover:bg-slate-900/40' : 'hover:bg-gray-50')
                  }
                `}
                onClick={() => onSelectMatch(match)}
              >
                <td className="px-4 py-3">
                  <Badge
                    variant={match.rank === 1 ? 'default' : 'secondary'}
                    className={match.rank === 1 ? 'bg-slate-700 text-white' : ''}
                  >
                    #{match.rank}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-medium">{match.flightA}</td>
                <td className="px-4 py-3 font-medium">{match.flightB}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{match.routeA}</td>
                <td className="px-4 py-3">
                  <span className="text-blue-600 font-medium">
                    {match.formationMinutes} min
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <Leaf className="w-4 h-4" />
                    {formatCO2(match.co2SavedKg)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-orange-600 font-medium">
                    {formatNumber(match.fuelSavedKg)} kg
                  </span>
                </td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                  {formatDistance(match.detourKm)}
                </td>
                <td className="px-4 py-3 font-mono text-sm">
                  {formatNumber(match.score, 1)}
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReplayMatch(match);
                    }}
                    className="flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" />
                    Replay
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="p-4 border-t bg-gray-50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Showing {matches.length} formation opportunities
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-green-600">
              <Leaf className="w-4 h-4" />
              Total potential: {formatCO2(matches.reduce((sum, m) => sum + m.co2SavedKg, 0))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
