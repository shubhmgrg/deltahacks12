import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeftRight, Plane, Calendar as CalendarIcon, MapPin, X } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from './ui/command';
import { searchAirports, formatAirport } from '@/api/airports';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function TripBar() {
  const navigate = useNavigate();

  // Form state
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departDate, setDepartDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [isOneWay, setIsOneWay] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [location, setLocation] = useState('');

  // Airport search state
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [fromResults, setFromResults] = useState([]);
  const [toResults, setToResults] = useState([]);
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const debouncedFromSearch = useDebouncedValue(fromSearch, 300);
  const debouncedToSearch = useDebouncedValue(toSearch, 300);

  // Calendar popovers
  const [departOpen, setDepartOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  // Selected airports
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [selectedTo, setSelectedTo] = useState(null);

  // Search airports for "from"
  useEffect(() => {
    if (debouncedFromSearch && fromOpen) {
      searchAirports(debouncedFromSearch, nearMe ? location : null).then(setFromResults);
    } else {
      setFromResults([]);
    }
  }, [debouncedFromSearch, fromOpen, nearMe, location]);

  // Search airports for "to"
  useEffect(() => {
    if (debouncedToSearch && toOpen) {
      searchAirports(debouncedToSearch, nearMe ? location : null).then(setToResults);
    } else {
      setToResults([]);
    }
  }, [debouncedToSearch, toOpen, nearMe, location]);

  // Update search when input changes
  useEffect(() => {
    setFromSearch(from);
  }, [from]);

  useEffect(() => {
    setToSearch(to);
  }, [to]);

  // Handle one-way toggle
  useEffect(() => {
    if (isOneWay) {
      setReturnDate('');
    }
  }, [isOneWay]);

  // Handle swap
  const handleSwap = () => {
    const tempFrom = from;
    const tempSelectedFrom = selectedFrom;
    setFrom(to);
    setTo(tempFrom);
    setSelectedFrom(selectedTo);
    setSelectedTo(tempSelectedFrom);
  };

  // Handle airport selection
  const handleSelectFrom = (airport) => {
    setSelectedFrom(airport);
    setFrom(formatAirport(airport));
    setFromOpen(false);
    setFromSearch('');
  };

  const handleSelectTo = (airport) => {
    setSelectedTo(airport);
    setTo(formatAirport(airport));
    setToOpen(false);
    setToSearch('');
  };

  // Format date for display
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return 'Select date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Format date for URL (YYYY-MM-DD)
  const formatDateURL = (dateStr) => {
    if (!dateStr) return '';
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Otherwise try to parse and format
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  };

  // Validate and submit
  const isFormValid = selectedFrom && selectedTo && departDate;
  const canSubmit = isFormValid;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const params = new URLSearchParams({
      from: selectedFrom.code,
      to: selectedTo.code,
      depart: formatDateURL(departDate),
    });

    if (!isOneWay && returnDate) {
      params.append('return', formatDateURL(returnDate));
    }

    if (nearMe && location) {
      params.append('near', location);
    }

    navigate(`/app?${params.toString()}`);
  };

  // Handle calendar date selection
  const handleDepartDateSelect = (date) => {
    setDepartDate(date);
    setDepartOpen(false);
  };

  const handleReturnDateSelect = (date) => {
    setReturnDate(date);
    setReturnOpen(false);
  };

  return (
    <Card className="w-full max-w-6xl mx-auto p-6 bg-slate-900/95 backdrop-blur-md border-slate-700/50 shadow-2xl rounded-2xl">
      <div className="flex flex-col lg:flex-row gap-4 items-end">
        {/* From */}
        <div className="flex-1 w-full lg:w-auto">
          <Label className="text-xs text-slate-400 mb-1.5 block">From</Label>
          <Popover open={fromOpen} onOpenChange={setFromOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Plane className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="Airport or city"
                  className="pl-10 pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                />
                {from && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFrom('');
                      setSelectedFrom(null);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-slate-900 border-slate-700" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search airports..." 
                  value={fromSearch}
                  onValueChange={setFromSearch}
                  className="bg-slate-800 border-slate-700"
                />
                <CommandList>
                  <CommandEmpty>No airports found.</CommandEmpty>
                  <CommandGroup>
                    {fromResults.map((airport) => (
                      <CommandItem
                        key={airport.code}
                        onSelect={() => handleSelectFrom(airport)}
                        className="cursor-pointer hover:bg-slate-800"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">
                            {airport.code} - {airport.name}
                          </span>
                          <span className="text-xs text-slate-400">{airport.city}, {airport.country}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Swap button */}
        <button
          onClick={handleSwap}
          className="h-9 w-9 flex items-center justify-center rounded-md bg-slate-800/50 border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Swap airports"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>

        {/* To */}
        <div className="flex-1 w-full lg:w-auto">
          <Label className="text-xs text-slate-400 mb-1.5 block">To</Label>
          <Popover open={toOpen} onOpenChange={setToOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Plane className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 rotate-90" />
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="Airport or city"
                  className="pl-10 pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                />
                {to && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTo('');
                      setSelectedTo(null);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-slate-900 border-slate-700" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search airports..." 
                  value={toSearch}
                  onValueChange={setToSearch}
                  className="bg-slate-800 border-slate-700"
                />
                <CommandList>
                  <CommandEmpty>No airports found.</CommandEmpty>
                  <CommandGroup>
                    {toResults.map((airport) => (
                      <CommandItem
                        key={airport.code}
                        onSelect={() => handleSelectTo(airport)}
                        className="cursor-pointer hover:bg-slate-800"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">
                            {airport.code} - {airport.name}
                          </span>
                          <span className="text-xs text-slate-400">{airport.city}, {airport.country}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Depart Date */}
        <div className="w-full lg:w-48">
          <Label className="text-xs text-slate-400 mb-1.5 block">Depart</Label>
          <Popover open={departOpen} onOpenChange={setDepartOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal bg-slate-800/50 border-slate-700 text-white hover:bg-slate-800"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatDateDisplay(departDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
              <Calendar
                value={departDate}
                onChange={handleDepartDateSelect}
                className="bg-slate-900 text-white"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Return Date */}
        <div className="w-full lg:w-48">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs text-slate-400">Return</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="one-way" className="text-xs text-slate-400 cursor-pointer">
                One-way
              </Label>
              <Switch
                id="one-way"
                checked={isOneWay}
                onCheckedChange={setIsOneWay}
              />
            </div>
          </div>
          <Popover open={returnOpen} onOpenChange={setReturnOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={isOneWay}
                className="w-full justify-start text-left font-normal bg-slate-800/50 border-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatDateDisplay(returnDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
              <Calendar
                value={returnDate}
                onChange={handleReturnDateSelect}
                className="bg-slate-900 text-white"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Location / Near Me */}
        <div className="w-full lg:w-48">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs text-slate-400">Location</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="near-me" className="text-xs text-slate-400 cursor-pointer">
                Near me
              </Label>
              <Switch
                id="near-me"
                checked={nearMe}
                onCheckedChange={setNearMe}
              />
            </div>
          </div>
          {nearMe ? (
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City name"
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
            />
          ) : (
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional location"
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
            />
          )}
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed px-8"
        >
          <Search className="mr-2 h-4 w-4" />
          Sync
        </Button>
      </div>
    </Card>
  );
}
