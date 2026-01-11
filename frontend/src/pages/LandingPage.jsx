import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Play, Plane, Fuel, Leaf, Wind, BarChart3,
  MapPin, Shield, RefreshCw, Route, Zap, Globe, ChevronRight
} from 'lucide-react';



// ============================================================================
// HOOKS
// ============================================================================

function useAnimatedCounter(end, duration = 2000, trigger = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!trigger) return;
    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // Ease-out cubic. Keep as number (supports large values + decimals).
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(end * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration, trigger]);

  return count;
}

function useScrollReveal(threshold = 0.2) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: threshold });
  return { ref, isInView };
}

// ============================================================================
// TOPBAR
// ============================================================================

function Topbar() {
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div
          className="flex items-center justify-between h-16 px-5 sm:px-8 rounded-2xl transition-all duration-300"
        >
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/landscape.png" alt="SkySync" className="h-12 w-auto" />
          </div>


          {/* Right side */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/app')}
              className="text-base py-2.5 px-5 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 hover:scale-[1.02]"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(8px)' }}
            >
              Run Simulation
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ============================================================================
// RADAR DISC CENTERPIECE
// ============================================================================

function RadarDisc({ animate }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [animate]);

  return (
    <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96">
      {/* Base disc */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1 } : {}}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="absolute inset-0 radar-disc"
      >
        {/* Grid */}
        <div className="absolute inset-0 bg-grid opacity-50" />

        {/* Rings */}
        {[25, 50, 75].map((size) => (
          <div key={size} className="radar-ring" style={{ width: `${size}%`, height: `${size}%` }} />
        ))}

        {/* Route arc SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 0 }} />
              <stop offset="50%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path
            d="M20,60 Q50,25 80,60"
            fill="none"
            stroke="url(#arcGrad)"
            strokeWidth="2"
            className={`arc-draw ${phase >= 2 ? 'animate' : ''}`}
            style={{ animationDelay: '0.2s' }}
          />
          <path
            d="M25,70 Q50,40 75,70"
            fill="none"
            stroke="url(#arcGrad)"
            strokeWidth="1.5"
            className={`arc-draw ${phase >= 2 ? 'animate' : ''}`}
            style={{ animationDelay: '0.5s' }}
          />
        </svg>

        {/* Planes */}
        <motion.div
          className="absolute"
          style={{ top: '35%', left: '25%' }}
          initial={{ x: -30, y: 20, opacity: 0, rotate: -30 }}
          animate={phase >= 3 ? { x: 0, y: 0, opacity: 1, rotate: 45 } : {}}
          transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Plane size={24} style={{ color: 'var(--accent-primary)' }} />
        </motion.div>

        <motion.div
          className="absolute"
          style={{ top: '30%', left: '35%' }}
          initial={{ x: -40, y: 30, opacity: 0, rotate: -30 }}
          animate={phase >= 3 ? { x: 0, y: 0, opacity: 1, rotate: 45 } : {}}
          transition={{ duration: 1, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Plane size={20} style={{ color: 'var(--accent-secondary)' }} />
        </motion.div>

        {/* Lock indicator */}
        <AnimatePresence>
          {phase >= 4 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute top-[28%] left-[45%] chip chip-accent text-xs animate-pulse-glow"
            >
              <Shield size={10} />
              Locked
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ============================================================================
// STATS STRIP
// ============================================================================

function StatsStrip({ animate }) {
  // Marketing metrics (landing page)
  // - 300k flights optimized -> ~150k formation pairs (2 flights per pair)
  // - 4% fuel savings applied to the follower aircraft (~150k saving flights)
  // - CO2: assumes ~400 kg fuel saved/flight and 3.16 kg CO2 per kg fuel
  const fuelSavedPct = useAnimatedCounter(4, 2000, animate);
  const flightsOptimized = useAnimatedCounter(300_000, 1800, animate);
  const flightsSearched = useAnimatedCounter(1_500_000, 2000, animate);
  const co2AvoidedKg = useAnimatedCounter(400_000_000, 2200, animate);

  const fmtCompact = (n) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);

  const stats = [
    {
      label: "Fuel Saved",
      value: `${Math.round(fuelSavedPct)}%`,
      sub: "per aircraft",
      color: "#ffffff",
    },
    {
      label: "CO₂ can be avoided",
      value: `${fmtCompact(co2AvoidedKg)} kg`,
      sub: "and so much more...",
      color: "#ffffff",
    },
    {
      label: "Flights Searched",
      value: `${fmtCompact(flightsSearched)}+`,
      sub: "candidates evaluated",
      color: "#ffffff",
    },
    {
      label: "Flights Optimized",
      value: `${fmtCompact(flightsOptimized)}+`,
      sub: "≈150k formation pairs",
      color: "#ffffff",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={animate ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 * i }}
          className="text-center p-4"
        >
          <p className="font-mono text-2xl sm:text-3xl font-bold" style={{ color: stat.color }}>
            {stat.value}
          </p>
          <p className="text-sm font-medium mt-1" style={{ color: '#ffffff' }}>{stat.label}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{stat.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// HERO SECTION
// ============================================================================

function Hero() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [origin, setOrigin] = useState('YYZ');
  const [dest, setDest] = useState('LHR');

  useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <section id="about" className="relative h-full pt-24 pb-8 px-4 sm:px-6 flex flex-col justify-center">
      <div className="relative z-10 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left: Text */}
          <div className="text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, filter: 'blur(10px)', y: 30 }}
              animate={loaded ? { opacity: 1, filter: 'blur(0)', y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]"
              style={{ color: '#ffffff' }}
            >
              Formation flight.
              <br />
              <span style={{ color: '#ffffff' }}>Real-world savings.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={loaded ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-4 text-lg sm:text-xl max-w-xl mx-auto lg:mx-0"
              style={{ color: 'rgba(255, 255, 255, 0.8)' }}
            >
              Match flights → Simulate formation path → Estimate fuel & CO₂ savings.
              Backed by research showing 2–7% efficiency gains.
            </motion.p>

            {/* Simulation Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={loaded ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-6 p-4 sm:p-6 max-w-xl mx-auto lg:mx-0 rounded-2xl"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.2)' }}
            >
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Origin</label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                    maxLength={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Destination</label>
                  <input
                    type="text"
                    value={dest}
                    onChange={(e) => setDest(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                    maxLength={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Date</label>
                  <input
                    type="date"
                    defaultValue="2025-01-15"
                    className="w-full px-3 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.2)', colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <button
                onClick={() => navigate('/app')}
                className="w-full py-3 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02]"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.3)' }}
              >
                Run Simulation
                <ArrowRight size={16} />
              </button>
            </motion.div>
          </div>

          {/* Right: Centerpiece */}
          <div className="relative flex justify-center items-center hidden lg:flex">
            <RadarDisc animate={loaded} />
          </div>
        </div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={loaded ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 pt-6"
          style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
        >
          <StatsStrip animate={loaded} />
        </motion.div>
      </div>
    </section>
  );
}



// ============================================================================
// AURORA GRADIENT SECTION
// ============================================================================

function AuroraGradientSection() {
  return (
    <section className="relative h-48 sm:h-64 overflow-hidden">
      <div className="aurora-gradient h-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />
    </section>
  );
}

// ============================================================================
// HOW IT WORKS
// ============================================================================

function HowItWorks() {
  const { ref, isInView } = useScrollReveal(0.2);

  const steps = [
    { icon: Route, title: 'Match flights', desc: 'Find flights with overlapping routes and compatible timing.' },
    { icon: Shield, title: 'Simulate formation', desc: 'Model safe formation paths respecting separation and altitude.' },
    { icon: Leaf, title: 'Estimate savings', desc: 'Calculate fuel & CO₂ reduction based on aerodynamic research.' },
  ];

  return (
    <section id="simulation" className="py-24 sm:py-32 px-4 sm:px-6" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-16"
        >
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#93c5fd' }}>
            Process
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold" style={{ color: '#ffffff' }}>
            How it works
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.15 * i }}
              className="card p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--accent-glow)' }}>
                <step.icon size={26} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>0{i + 1}</span>
              <h3 className="font-heading text-lg font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
              <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>{step.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Research note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          id="research"
          className="mt-12 card p-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-glow)' }}>
              <BarChart3 size={18} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h4 className="font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>Research & Assumptions</h4>
              <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li>• Efficiency range: 2–7% based on NASA/Airbus formation flight studies</li>
                <li>• Constraints: schedule overlap, safe separation (1.5–3km), altitude matching</li>
                <li>• This is a proof-of-concept prototype built at DeltaHacks XI</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================================
// FEATURES ORBIT
// ============================================================================

function FeaturesOrbit() {
  const { ref, isInView } = useScrollReveal(0.3);
  const [active, setActive] = useState(0);

  const features = [
    { icon: Route, label: 'Route Matching', desc: 'Intelligent pairing of compatible flight paths' },
    { icon: Shield, label: 'Safety Constraints', desc: 'Respects separation, airspace, weather limits' },
    { icon: Wind, label: 'Drag Model', desc: 'Wake surfing physics for trailing aircraft' },
    { icon: Leaf, label: 'CO₂ Estimator', desc: 'Real-time emissions reduction calculator' },
    { icon: RefreshCw, label: 'Replay', desc: 'Animated visualization of formation flights' },
  ];

  return (
    <section id="impact" className="py-24 sm:py-32 px-4 sm:px-6" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-16"
        >
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#93c5fd' }}>
            Features
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold" style={{ color: '#ffffff' }}>
            Simulation Engine
          </h2>
        </motion.div>

        <div className="relative flex flex-col lg:flex-row items-center gap-12">
          {/* Center */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="relative w-48 h-48 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
          >
            <div className="text-center">
              <Zap size={32} style={{ color: 'var(--accent-primary)' }} className="mx-auto mb-2" />
              <span className="font-heading font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Engine</span>
            </div>

            {/* Orbit items */}
            {features.map((f, i) => {
              const angle = (i / features.length) * 2 * Math.PI - Math.PI / 2;
              const radius = 100;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              return (
                <motion.button
                  key={f.label}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={isInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className={`absolute w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${active === i ? 'animate-pulse-glow' : ''
                    }`}
                  style={{
                    left: `calc(50% + ${x}px - 24px)`,
                    top: `calc(50% + ${y}px - 24px)`,
                    backgroundColor: active === i ? 'var(--accent-primary)' : 'var(--bg-card)',
                    border: '1px solid var(--border-primary)',
                  }}
                  onClick={() => setActive(i)}
                >
                  <f.icon size={20} style={{ color: active === i ? 'var(--text-inverse)' : 'var(--accent-primary)' }} />
                </motion.button>
              );
            })}
          </motion.div>

          {/* Caption */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.5 }}
            className="card p-6 flex-1 max-w-md"
          >
            <div className="flex items-center gap-3 mb-3">
              {React.createElement(features[active].icon, { size: 24, style: { color: 'var(--accent-primary)' } })}
              <h3 className="font-heading text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {features[active].label}
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>{features[active].desc}</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// LANDING PAGE MAP PREVIEW
// ============================================================================

// Sample flight routes for demonstration
const SAMPLE_ROUTES = [
  { from: [-79.63, 43.68], to: [-0.46, 51.47], color: '#6366f1' },  // Toronto to London (Indigo)
  { from: [-73.78, 40.64], to: [2.55, 49.01], color: '#8b5cf6' },   // New York to Paris (Purple)
  { from: [-118.41, 33.94], to: [139.78, 35.55], color: '#22c55e' } // LA to Tokyo (Green)
];

// Generate a great circle arc between two points
function generateArc(start, end, numPoints = 50) {
  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    // Simple linear interpolation with altitude curve
    const lng = start[0] + t * (end[0] - start[0]);
    const lat = start[1] + t * (end[1] - start[1]);
    coords.push([lng, lat]);
  }
  return coords;
}

function LandingMapPreview() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

  useEffect(() => {
    if (!mapboxToken || map.current) return;

    // Dynamic import to avoid SSR issues
    import('mapbox-gl').then((mapboxgl) => {
      import('mapbox-gl/dist/mapbox-gl.css');

      mapboxgl.default.accessToken = mapboxToken;

      map.current = new mapboxgl.default.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-40, 35],
        zoom: 1.5,
        pitch: 20,
        bearing: 0,
        projection: 'globe',
        interactive: false, // Disable interactions for preview
      });

      map.current.on('style.load', () => {
        // Set atmosphere
        map.current.setFog({
          'horizon-blend': 0.02,
          'space-color': '#1a1a2e',
          'star-intensity': 0.1,
        });

        // Add flight route sources and layers
        SAMPLE_ROUTES.forEach((route, i) => {
          const arcCoords = generateArc(route.from, route.to);

          map.current.addSource(`route-${i}`, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: arcCoords,
              },
            },
          });

          // Glow layer
          map.current.addLayer({
            id: `route-glow-${i}`,
            type: 'line',
            source: `route-${i}`,
            paint: {
              'line-color': route.color,
              'line-width': 6,
              'line-opacity': 0.3,
              'line-blur': 4,
            },
          });

          // Main line
          map.current.addLayer({
            id: `route-line-${i}`,
            type: 'line',
            source: `route-${i}`,
            paint: {
              'line-color': route.color,
              'line-width': 2,
              'line-opacity': 0.9,
            },
          });
        });

        setMapLoaded(true);

        // Start spinning animation
        let bearing = 0;
        const spin = () => {
          if (!map.current) return;
          bearing += 0.15;
          map.current.setBearing(bearing);
          requestAnimationFrame(spin);
        };
        spin();
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken]);

  if (!mapboxToken) {
    return (
      <div className="h-52 rounded-xl mb-6 flex items-center justify-center relative overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Map preview requires Mapbox token</span>
      </div>
    );
  }

  return (
    <div className="h-52 rounded-xl mb-6 relative overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
      <div ref={mapContainer} className="absolute inset-0" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-primary)' }} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DEMO PREVIEW
// ============================================================================

function DemoPreview() {
  const navigate = useNavigate();
  const { ref, isInView } = useScrollReveal(0.2);
  const [origin, setOrigin] = useState('YYZ');
  const [dest, setDest] = useState('LHR');

  return (
    <section className="py-24 sm:py-32 px-4 sm:px-6" ref={ref}>
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#93c5fd' }}>
            Try It
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold" style={{ color: '#ffffff' }}>
            Run a simulation
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="card-solid p-6 sm:p-8"
        >
          {/* Mapbox Globe Preview */}
          <LandingMapPreview />

          {/* Input form */}
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Origin</label>
              <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} className="input" maxLength={3} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Destination</label>
              <input type="text" value={dest} onChange={(e) => setDest(e.target.value.toUpperCase())} className="input" maxLength={3} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Date</label>
              <input type="date" defaultValue="2025-01-15" className="input" />
            </div>
          </div>

          <button onClick={() => navigate('/app')} className="btn-primary w-full sm:w-auto">
            Simulate
            <ArrowRight size={16} />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================================
// FINAL CTA
// ============================================================================

function FinalCTA() {
  const navigate = useNavigate();
  const { ref, isInView } = useScrollReveal(0.3);

  return (
    <section className="py-24 sm:py-32 px-4 sm:px-6" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        className="max-w-3xl mx-auto text-center card p-12"
      >
        <h2 className="font-heading text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Ready to explore formation efficiency?
        </h2>
        <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
          Run your first simulation and see potential fuel savings across real flight routes.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button onClick={() => navigate('/app')} className="btn-primary">
            Run your first simulation
            <ArrowRight size={16} />
          </button>
          <button className="btn-secondary">
            Read research notes
          </button>
        </div>
      </motion.div>
    </section>
  );
}

// ============================================================================
// FOOTER
// ============================================================================

function Footer() {
  return (
    <footer className="py-8 px-4 sm:px-6" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/landscape.png" alt="SkySync" className="h-7 w-auto" />
          <span className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>DeltaHacks XI · 2025</span>
        </div>
        <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
          A hackathon experiment in flight coordination
        </p>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN LANDING PAGE
// ============================================================================

export default function LandingPage() {
  const [appReady, setAppReady] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setAppReady(true), 300);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!appReady) {
    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${fadeOut ? 'opacity-0' : 'opacity-100'
          }`}
      >
        {/* Video background for loading screen */}
        <div className="absolute inset-0">
          <video
            src="/2823622-uhd_3840_2160_30fps.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        <div className="loading-screen-wrapper relative z-10">
          <div className="loading-container">
            {/* Animated glow rings */}
            <div className="glow-ring glow-ring-1" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}></div>
            <div className="glow-ring glow-ring-2" style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}></div>
            <div className="glow-ring glow-ring-3" style={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}></div>

            {/* Main logo */}
            <img
              src="/transparent%20skysync.png"
              alt="SkySync Loading..."
              className="loading-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden relative">
      {/* Full-screen video background */}
      <div className="absolute inset-0">
        <video
          src="/2823622-uhd_3840_2160_30fps.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <Topbar />
      <main className="relative z-10 h-full">
        <Hero />
      </main>
    </div>
  );
}
