import React, { useMemo } from 'react';

/**
 * MotionBackdrop - Animated plane flight paths background
 *
 * Configuration:
 * - planeCount: Number of animated planes (default: 8)
 * - To adjust animation speed: modify animationDuration in generatePlanes()
 * - To adjust plane size: modify the width/height of plane SVG paths
 * - Respects prefers-reduced-motion
 */

// Simple plane SVG path
const PlaneSVG = ({ className = '', style = {} }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

// Generate flight paths as curved bezier paths
const generateFlightPaths = (count = 6) => {
  const paths = [];

  // Predefined curved flight paths that span the viewport
  const flightRoutes = [
    // Transatlantic-style routes
    { start: { x: -5, y: 30 }, control1: { x: 25, y: 15 }, control2: { x: 75, y: 45 }, end: { x: 105, y: 25 } },
    { start: { x: 105, y: 70 }, control1: { x: 70, y: 85 }, control2: { x: 30, y: 55 }, end: { x: -5, y: 75 } },
    { start: { x: -5, y: 50 }, control1: { x: 20, y: 35 }, control2: { x: 80, y: 65 }, end: { x: 105, y: 50 } },
    { start: { x: 105, y: 20 }, control1: { x: 80, y: 40 }, control2: { x: 20, y: 20 }, end: { x: -5, y: 45 } },
    { start: { x: 30, y: -5 }, control1: { x: 15, y: 30 }, control2: { x: 45, y: 70 }, end: { x: 70, y: 105 } },
    { start: { x: 70, y: 105 }, control1: { x: 85, y: 60 }, control2: { x: 55, y: 20 }, end: { x: 20, y: -5 } },
    { start: { x: -5, y: 80 }, control1: { x: 30, y: 60 }, control2: { x: 70, y: 80 }, end: { x: 105, y: 65 } },
    { start: { x: 105, y: 35 }, control1: { x: 65, y: 20 }, control2: { x: 35, y: 50 }, end: { x: -5, y: 35 } },
  ];

  for (let i = 0; i < count; i++) {
    const route = flightRoutes[i % flightRoutes.length];
    paths.push({
      id: i,
      d: `M ${route.start.x} ${route.start.y} C ${route.control1.x} ${route.control1.y}, ${route.control2.x} ${route.control2.y}, ${route.end.x} ${route.end.y}`,
      ...route,
    });
  }

  return paths;
};

// Generate plane animations
const generatePlanes = (count = 8) => {
  const planes = [];
  const baseRoutes = generateFlightPaths(8);

  for (let i = 0; i < count; i++) {
    const route = baseRoutes[i % baseRoutes.length];
    // Stagger animation timings
    const delay = (i * 3) % 20; // Stagger by 3s, loop every 20s
    const duration = 15 + (i % 4) * 5; // 15-30s duration
    const size = 12 + (i % 3) * 4; // 12-20px size

    planes.push({
      id: i,
      pathId: route.id,
      delay,
      duration,
      size,
      opacity: 0.3 + (i % 3) * 0.1, // 0.3-0.5 opacity
    });
  }

  return planes;
};

export default function MotionBackdrop({ planeCount = 8, className = '' }) {
  const paths = useMemo(() => generateFlightPaths(8), []);
  const planes = useMemo(() => generatePlanes(planeCount), [planeCount]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* SVG container for paths and planes */}
      <svg
        className="absolute inset-0 w-full h-full motion-reduce:hidden"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Define flight paths for offset-path animation */}
          {paths.map((path) => (
            <path
              key={`path-def-${path.id}`}
              id={`flight-path-${path.id}`}
              d={path.d}
              fill="none"
            />
          ))}

          {/* Gradient for path lines */}
          <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
            <stop offset="50%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Visible flight path lines (dashed, subtle) */}
        {paths.slice(0, 4).map((path) => (
          <path
            key={`path-visible-${path.id}`}
            d={path.d}
            fill="none"
            stroke="url(#pathGradient)"
            strokeWidth="0.15"
            strokeDasharray="2 4"
            className="animate-dash"
            style={{
              animationDelay: `${path.id * 2}s`,
            }}
          />
        ))}
      </svg>

      {/* Animated planes using CSS offset-path */}
      {planes.map((plane) => {
        const path = paths[plane.pathId];
        // Calculate rotation based on path direction
        const dx = path.end.x - path.start.x;
        const dy = path.end.y - path.start.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <div
            key={`plane-${plane.id}`}
            className="absolute motion-reduce:hidden"
            style={{
              width: `${plane.size}px`,
              height: `${plane.size}px`,
              opacity: plane.opacity,
              color: 'rgb(59, 130, 246)',
              offsetPath: `path("${path.d}")`,
              offsetRotate: '0deg',
              animation: `flyAlongPath ${plane.duration}s linear infinite`,
              animationDelay: `${plane.delay}s`,
              transform: `rotate(${angle + 90}deg)`,
              left: '0',
              top: '0',
              // Scale from viewBox coords (0-100) to viewport
              transformOrigin: 'center center',
            }}
          >
            <PlaneSVG
              className="w-full h-full drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
            />
          </div>
        );
      })}

      {/* Static background elements for reduced motion */}
      <div className="hidden motion-reduce:block absolute inset-0">
        {/* Simple static dots representing flight positions */}
        {[...Array(6)].map((_, i) => (
          <div
            key={`static-${i}`}
            className="absolute w-2 h-2 bg-blue-500/20 rounded-full"
            style={{
              left: `${20 + (i * 15)}%`,
              top: `${25 + (i % 3) * 20}%`,
            }}
          />
        ))}
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes flyAlongPath {
          0% {
            offset-distance: 0%;
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          95% {
            opacity: 1;
          }
          100% {
            offset-distance: 100%;
            opacity: 0;
          }
        }

        @keyframes dash {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -60;
          }
        }

        .animate-dash {
          animation: dash 20s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .motion-reduce\\:hidden {
            display: none !important;
          }
          .motion-reduce\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
