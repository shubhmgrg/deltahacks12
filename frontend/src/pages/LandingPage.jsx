import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun,
  Moon,
  ChevronDown,
  Plane,
  Route,
  Shield,
  BarChart3,
  Zap,
  ArrowRight,
  Check,
  Loader2
} from 'lucide-react';
import StoryLightUpSkySync from '../components/StoryLightUpSkySync';

// Theme hook with localStorage + system preference
function useTheme() {
  const getInitialTheme = () => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('skysync-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  };

  const [theme, setTheme] = useState(getInitialTheme);

  // Apply theme class whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    console.log('Theme changed to:', theme); // Debug log
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
    localStorage.setItem('skysync-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      console.log('Toggling from', prev, 'to', newTheme); // Debug log
      return newTheme;
    });
  }, []);

  return { theme, toggle };
}

// Nav component
function Nav({ theme, onToggle }) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="sticky top-0 z-50 px-4 sm:px-6 pt-4">
      <nav className="max-w-4xl mx-auto bg-white/90 dark:bg-[#2b2d31]/90 backdrop-blur-md rounded-full border border-neutral-200/60 dark:border-[#3f4147]/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
        <div className="px-5 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img
                src="/landscape.png"
                alt="SkySync"
                className="h-[54px] w-auto"
              />
            </div>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => scrollTo('product')}
                className="px-3 py-1.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-[#35373c] transition-colors"
              >
                Product
              </button>
              <button
                onClick={() => scrollTo('how-it-works')}
                className="px-3 py-1.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-[#35373c] transition-colors"
              >
                How it works
              </button>
              <button
                onClick={() => scrollTo('demo')}
                className="px-3 py-1.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-[#35373c] transition-colors"
              >
                Demo
              </button>
              <button
                onClick={() => scrollTo('faq')}
                className="px-3 py-1.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-[#35373c] transition-colors"
              >
                FAQ
              </button>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <button
                onClick={onToggle}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-neutral-500 dark:text-[#b5bac1] hover:text-neutral-700 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-[#35373c] transition-colors"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
              <button
                onClick={() => navigate('/app')}
                className="px-3 py-1.5 text-sm font-medium text-white bg-neutral-900 dark:bg-[#f2f3f5] dark:text-[#1e1f22] rounded-md hover:bg-neutral-800 dark:hover:bg-white transition-colors"
              >
                Try Demo
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-[#b5bac1] dark:hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile menu - dropdown below the floating bar */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 mx-auto max-w-4xl bg-white/95 dark:bg-[#2b2d31]/95 backdrop-blur-md rounded-2xl border border-neutral-200/60 dark:border-[#3f4147]/60 shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)] p-2">
          <div className="flex flex-col gap-1">
            <button onClick={() => scrollTo('product')} className="px-4 py-2.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:bg-neutral-100 dark:hover:bg-[#35373c] rounded-xl text-left">Product</button>
            <button onClick={() => scrollTo('how-it-works')} className="px-4 py-2.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:bg-neutral-100 dark:hover:bg-[#35373c] rounded-xl text-left">How it works</button>
            <button onClick={() => scrollTo('demo')} className="px-4 py-2.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:bg-neutral-100 dark:hover:bg-[#35373c] rounded-xl text-left">Demo</button>
            <button onClick={() => scrollTo('faq')} className="px-4 py-2.5 text-sm text-neutral-600 dark:text-[#b5bac1] hover:bg-neutral-100 dark:hover:bg-[#35373c] rounded-xl text-left">FAQ</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Hero section
function Hero() {
  const navigate = useNavigate();

  return (
    <section className="pt-16 pb-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto text-center">
        {/* Status pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 text-xs font-medium text-neutral-600 dark:text-[#b5bac1] bg-neutral-100 dark:bg-[#2b2d31] rounded-full border border-neutral-200 dark:border-[#3f4147]">
          <span className="w-1.5 h-1.5 bg-[#23a559] rounded-full animate-pulse" />
          Hackathon build · Live prototype
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-neutral-900 dark:text-[#f2f3f5] mb-5">
          Make the sky coordinate itself.
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-neutral-600 dark:text-[#b5bac1] mb-8 max-w-xl mx-auto leading-relaxed">
          SkySync finds flights heading the same direction and calculates if flying in formation could save fuel. No magic—just geometry and physics.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate('/app')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-neutral-900 dark:bg-[#f2f3f5] dark:text-[#1e1f22] rounded-lg hover:bg-neutral-800 dark:hover:bg-white transition-colors"
          >
            Try Demo
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-neutral-700 dark:text-[#dbdee1] bg-neutral-100 dark:bg-[#4e5058] rounded-lg hover:bg-neutral-200 dark:hover:bg-[#5d5f66] transition-colors"
          >
            View Approach
          </button>
        </div>
      </div>
    </section>
  );
}

// Demo Preview section
function DemoPreview() {
  const [departure, setDeparture] = useState('JFK');
  const [destination, setDestination] = useState('LHR');
  const [date, setDate] = useState('2025-02-15');
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState(null);

  const handleSimulate = () => {
    setSimulating(true);
    setResult(null);

    // Fake simulation with random-ish realistic data
    setTimeout(() => {
      const pairings = Math.floor(Math.random() * 4) + 1;
      const savings = (2 + Math.random() * 3).toFixed(1);
      setResult({
        pairings,
        savings,
        routes: [
          { from: departure, to: destination, partner: 'AA102', overlap: '847 km' },
          { from: departure, to: destination, partner: 'DL45', overlap: '623 km' },
        ].slice(0, pairings > 1 ? 2 : 1)
      });
      setSimulating(false);
    }, 1500);
  };

  return (
    <section id="demo" className="py-16 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-[#949ba4] mb-2">Interactive Preview</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-[#f2f3f5]">
            See it in action
          </h2>
        </div>

        {/* Notion-style block */}
        <div className="bg-white dark:bg-[#2b2d31] border border-neutral-200 dark:border-[#1e1f22] rounded-lg overflow-hidden">
          {/* Block header */}
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-[#1e1f22] flex items-center gap-2">
            <Plane size={14} className="text-neutral-400 dark:text-[#949ba4]" />
            <span className="text-sm font-medium text-neutral-700 dark:text-[#dbdee1]">Flight Pairing Finder</span>
          </div>

          {/* Form content */}
          <div className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Departure */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-[#949ba4] mb-1.5">
                  Departure
                </label>
                <input
                  type="text"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                  placeholder="JFK"
                  maxLength={3}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1e1f22] border border-neutral-200 dark:border-[#3f4147] rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-[#5865f2] text-neutral-900 dark:text-[#dbdee1] placeholder-neutral-400 dark:placeholder-[#6d6f78]"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-[#949ba4] mb-1.5">
                  Destination
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value.toUpperCase())}
                  placeholder="LHR"
                  maxLength={3}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1e1f22] border border-neutral-200 dark:border-[#3f4147] rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-[#5865f2] text-neutral-900 dark:text-[#dbdee1] placeholder-neutral-400 dark:placeholder-[#6d6f78]"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-[#949ba4] mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1e1f22] border border-neutral-200 dark:border-[#3f4147] rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-[#5865f2] text-neutral-900 dark:text-[#dbdee1]"
                />
              </div>
            </div>

            {/* Simulate button */}
            <button
              onClick={handleSimulate}
              disabled={simulating || !departure || !destination}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-[#f2f3f5] dark:text-[#1e1f22] rounded-md hover:bg-neutral-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {simulating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Simulating...
                </>
              ) : (
                'Simulate'
              )}
            </button>
          </div>

          {/* Result block */}
          {result && (
            <div className="border-t border-neutral-200 dark:border-[#1e1f22] bg-neutral-50 dark:bg-[#232428] p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-emerald-100 dark:bg-[#23a559]/20 rounded-md">
                  <Check size={16} className="text-emerald-600 dark:text-[#23a559]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-[#f2f3f5]">
                    {result.pairings} candidate flight pairing{result.pairings > 1 ? 's' : ''} found
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-[#949ba4] mt-0.5">
                    Est. {result.savings}% fuel saved per formation
                  </p>

                  {/* Route cards */}
                  <div className="mt-4 space-y-2">
                    {result.routes.map((route, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-[#2b2d31] border border-neutral-200 dark:border-[#3f4147] rounded-md text-sm">
                        <Route size={14} className="text-neutral-400 dark:text-[#949ba4] flex-shrink-0" />
                        <span className="text-neutral-600 dark:text-[#b5bac1]">
                          {route.from} → {route.to}
                        </span>
                        <span className="text-neutral-400 dark:text-[#4e5058]">·</span>
                        <span className="text-neutral-500 dark:text-[#949ba4]">
                          Partner: <span className="font-mono text-xs">{route.partner}</span>
                        </span>
                        <span className="text-neutral-400 dark:text-[#4e5058]">·</span>
                        <span className="text-neutral-500 dark:text-[#949ba4]">
                          {route.overlap} overlap
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Why SkySync section
function WhySkySync() {
  const features = [
    {
      icon: Route,
      title: 'Visual pairing',
      description: 'See exactly where flight paths overlap and how formations would work on a real map.'
    },
    {
      icon: Shield,
      title: 'Safety constraints',
      description: 'All calculations respect minimum distances, airspace rules, and weather constraints.'
    },
    {
      icon: BarChart3,
      title: 'Transparent savings',
      description: 'Every estimate shows the math: distance saved, fuel reduced, CO₂ avoided.'
    },
    {
      icon: Zap,
      title: 'Fast simulation',
      description: 'Results in seconds. Iterate on routes and timing without waiting.'
    }
  ];

  return (
    <section id="product" className="py-16 px-4 sm:px-6 border-t border-neutral-200 dark:border-[#1e1f22]">
      <div className="max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-[#949ba4] mb-2">Why SkySync</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-[#f2f3f5]">
            Built for clarity, not complexity
          </h2>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((feature, i) => (
            <div
              key={i}
              className="p-5 bg-white dark:bg-[#2b2d31] border border-neutral-200 dark:border-[#1e1f22] rounded-lg"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-neutral-100 dark:bg-[#35373c] rounded-md">
                  <feature.icon size={16} className="text-neutral-600 dark:text-[#b5bac1]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-[#f2f3f5] mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-neutral-500 dark:text-[#949ba4] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// How It Works section
function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Find candidate flights',
      description: 'We scan scheduled flights for routes that share significant overlapping segments.'
    },
    {
      step: '02',
      title: 'Estimate formation path',
      description: 'Calculate where aircraft could safely fly in formation, respecting altitude and spacing constraints.'
    },
    {
      step: '03',
      title: 'Calculate fuel & CO₂ impact',
      description: 'Physics-based estimates of drag reduction and corresponding fuel savings for the trailing aircraft.'
    },
    {
      step: '04',
      title: 'Share & iterate',
      description: 'Export results, adjust parameters, and refine pairings until you find viable formations.'
    }
  ];

  return (
    <section id="how-it-works" className="py-16 px-4 sm:px-6 border-t border-neutral-200 dark:border-[#1e1f22]">
      <div className="max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-[#949ba4] mb-2">Process</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-[#f2f3f5]">
            How it works
          </h2>
        </div>

        {/* Steps */}
        <div className="space-y-1">
          {steps.map((item, i) => (
            <div
              key={i}
              className="flex gap-4 p-4 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#35373c]/50 transition-colors"
            >
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-xs font-mono text-neutral-400 dark:text-[#949ba4] border border-neutral-200 dark:border-[#3f4147] rounded-md bg-white dark:bg-[#2b2d31]">
                {item.step}
              </div>
              <div className="pt-1">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-[#f2f3f5] mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-neutral-500 dark:text-[#949ba4] leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// FAQ section
function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [
    {
      question: 'Is this actually possible with current aircraft?',
      answer: 'Research programs like NASA\'s and Airbus\'s have demonstrated fuel savings of 5-10% for trailing aircraft in formation. The tech exists; the coordination infrastructure doesn\'t—yet.'
    },
    {
      question: 'How accurate are the savings estimates?',
      answer: 'Our estimates are based on published aerodynamic research. They\'re meant to indicate potential, not guarantee outcomes. Real savings depend on aircraft type, weather, and pilot execution.'
    },
    {
      question: 'Is this a real product or a prototype?',
      answer: 'This is a hackathon prototype demonstrating the concept. The calculations are real, but we\'re not connected to any flight scheduling systems. Think of it as a proof-of-concept tool.'
    },
    {
      question: 'What data do you use?',
      answer: 'We work with publicly available flight schedule data and standard great-circle route calculations. No proprietary airline data or real-time tracking.'
    },
    {
      question: 'Why formation flight?',
      answer: 'Birds figured this out millions of years ago. Trailing aircraft can reduce drag by flying in the wake vortex of a leader. Less drag = less fuel = less CO₂.'
    }
  ];

  return (
    <section id="faq" className="py-16 px-4 sm:px-6 border-t border-neutral-200 dark:border-[#1e1f22]">
      <div className="max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-[#949ba4] mb-2">FAQ</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-[#f2f3f5]">
            Common questions
          </h2>
        </div>

        {/* Accordion */}
        <div className="border border-neutral-200 dark:border-[#1e1f22] rounded-lg overflow-hidden divide-y divide-neutral-200 dark:divide-[#1e1f22]">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white dark:bg-[#2b2d31]">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-[#35373c]/50 transition-colors"
                aria-expanded={openIndex === i}
              >
                <span className="text-sm font-medium text-neutral-900 dark:text-[#f2f3f5]">
                  {faq.question}
                </span>
                <ChevronDown
                  size={16}
                  className={`flex-shrink-0 text-neutral-400 dark:text-[#949ba4] transition-transform duration-200 ${openIndex === i ? 'rotate-180' : ''}`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-200 ${openIndex === i ? 'max-h-48' : 'max-h-0'}`}
              >
                <div className="px-4 pb-4 text-sm text-neutral-500 dark:text-[#b5bac1] leading-relaxed">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="py-8 px-4 sm:px-6 border-t border-neutral-200 dark:border-[#1e1f22]">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500 dark:text-[#949ba4]">
          <div className="flex items-center gap-3">
            <img
              src="/landscape.png"
              alt="SkySync"
              className="h-9 w-auto opacity-70"
            />
            <span className="text-neutral-400 dark:text-[#6d6f78]">·</span>
            <span>DeltaHacks 2025</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-400 dark:text-[#6d6f78]">
              A hackathon experiment in flight coordination
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Main Landing Page component
export default function LandingPage() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen overflow-x-hidden relative">
      {/* Background GIF with theme-aware overlay */}
      <div className="fixed inset-0 z-0">
        <img
          src="/vidclouds.gif"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Theme overlay - light mode: white overlay, dark mode: dark overlay */}
        <div className="absolute inset-0 bg-[#fafafa]/85 dark:bg-[#313338]/90 transition-colors duration-300" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Nav theme={theme} onToggle={toggle} />
        <main>
          <Hero />
          <StoryLightUpSkySync />
          <DemoPreview />
          <WhySkySync />
          <HowItWorks />
          <FAQ />
        </main>
        <Footer />
      </div>
    </div>
  );
}
