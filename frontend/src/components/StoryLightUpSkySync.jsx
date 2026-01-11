import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

// ============================================================================
// INLINE SVG ICONS
// ============================================================================

// Small plane icon SVG
const PlaneIcon = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

// Leaf icon for eco chips
const LeafIcon = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
  </svg>
);

// Lock icon for formation lock chip
const LockIcon = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
  </svg>
);

// ============================================================================
// UI COMPONENTS
// ============================================================================

// App badge icon (SkySync style - iOS-like rounded square)
const AppBadge = () => (
  <span className="inline-flex items-center justify-center w-9 h-9 ml-2 rounded-xl bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 align-middle transform -translate-y-0.5">
    <PlaneIcon className="text-white w-5 h-5 -rotate-45" />
  </span>
);

// Inline chip component (iOS-style pill)
const Chip = ({ children, variant = "yellow", icon: Icon }) => {
  const variants = {
    yellow: "bg-amber-400 text-amber-950 shadow-amber-400/30",
    green: "bg-emerald-400 text-emerald-950 shadow-emerald-400/30",
    blue: "bg-sky-400 text-sky-950 shadow-sky-400/30",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 mx-1.5 rounded-full text-sm font-semibold shadow-lg align-middle transform -translate-y-0.5 ${variants[variant]}`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </span>
  );
};

// Progress dots indicator (left side navigation)
const ProgressDots = ({ total, activeIndex }) => (
  <div className="fixed left-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-3 z-50">
    {Array.from({ length: total }).map((_, i) => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full cursor-pointer"
        animate={{
          backgroundColor: i === activeIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.25)',
          scale: i === activeIndex ? 1.4 : 1,
          boxShadow: i === activeIndex ? '0 0 12px rgba(255,255,255,0.5)' : '0 0 0px rgba(255,255,255,0)',
        }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      />
    ))}
  </div>
);

// ============================================================================
// STORY CONTENT DATA
// ============================================================================

const storyParagraphs = [
  {
    id: 1,
    content: (
      <>
        <span className="text-white font-bold text-[22px] sm:text-[26px] md:text-[28px]">SkySync</span>
        <AppBadge />
        <span className="ml-2 text-amber-300">✦</span>
        <br />
        <span className="mt-3 block">A climate efficiency simulator for real flight traffic.</span>
      </>
    ),
  },
  {
    id: 2,
    content: "Commercial planes burn massive fuel. Even small improvements matter.",
  },
  {
    id: 3,
    content: (
      <>
        Research suggests formation-style flying could reduce fuel burn by a few percent
        <Chip variant="yellow" icon={LeafIcon}>2–7% potential</Chip>
        —yet it's rarely communicated in a way people can understand.
      </>
    ),
  },
  {
    id: 4,
    content: (
      <>
        <span className="block mb-5 font-semibold">So we built SkySync in a way that's instantly obvious.</span>
        We pull real flight tracks, match compatible routes, simulate a safe formation path, and estimate savings.
      </>
    ),
  },
  {
    id: 5,
    content: (
      <>
        <span className="block mb-5 font-semibold">And we animate it.</span>
        Planes don't just move—they snap into formation.
        <Chip variant="green" icon={LockIcon}>Formation Lock</Chip>
      </>
    ),
  },
  {
    id: 6,
    content: (
      <>
        <span className="block mb-5">
          CO₂ doesn't just get reported—it drops in real time on screen.
          <Chip variant="blue">CO₂ -4%</Chip>
        </span>
        <span className="italic">
          SkySync is a visual proof-of-possibility: what the sky could look like if we optimized together.
        </span>
      </>
    ),
  },
];

// ============================================================================
// STORY PARAGRAPH COMPONENT
// ============================================================================

const StoryParagraph = React.forwardRef(({ children, isActive, reducedMotion }, ref) => {
  return (
    <motion.p
      ref={ref}
      className="text-[18px] sm:text-[22px] md:text-[26px] leading-[1.4] md:leading-[1.45] font-medium"
      animate={{
        opacity: isActive ? 1 : 0.38,
        y: !reducedMotion && isActive ? -3 : 0,
        textShadow: !reducedMotion && isActive
          ? '0 0 60px rgba(255,255,255,0.2), 0 0 120px rgba(147,197,253,0.15)'
          : '0 0 0px rgba(255,255,255,0)',
      }}
      transition={{
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }}
      style={{
        color: isActive ? '#f1f5f9' : '#64748b',
      }}
    >
      {children}
    </motion.p>
  );
});

StoryParagraph.displayName = 'StoryParagraph';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StoryLightUpSkySync() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const paragraphRefs = useRef([]);
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Calculate which paragraph is closest to viewport center
  const updateActiveIndex = useCallback(() => {
    const viewportCenter = window.innerHeight / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;

    paragraphRefs.current.forEach((ref, index) => {
      if (ref) {
        const rect = ref.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(elementCenter - viewportCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }
    });

    setActiveIndex(closestIndex);
  }, []);

  // Scroll handler with RAF for performance
  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(updateActiveIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial calculation
    updateActiveIndex();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updateActiveIndex]);

  return (
    <section
      ref={containerRef}
      className="relative w-full py-16 md:py-24 overflow-hidden"
    >
      {/* Background GIF */}
      <div className="absolute inset-0 z-0">
        <img
          src="/vidclouds.gif"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Dark overlay - matches Hero section */}
        <div className="absolute inset-0 bg-[#313338]/90" />
      </div>
      {/* Subtle radial gradient overlay */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 50%)',
        }}
      />

      {/* Secondary ambient glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(59,130,246,0.1) 0%, transparent 50%)',
        }}
      />

      {/* Progress dots */}
      <ProgressDots total={storyParagraphs.length} activeIndex={activeIndex} />

      {/* Content container */}
      <div className="relative z-10 max-w-[720px] mx-auto px-6 md:px-8">
        <div className="flex flex-col gap-8 md:gap-10">
          {storyParagraphs.map((paragraph, index) => (
            <StoryParagraph
              key={paragraph.id}
              ref={(el) => (paragraphRefs.current[index] = el)}
              isActive={index === activeIndex}
              reducedMotion={reducedMotion}
            >
              {paragraph.content}
            </StoryParagraph>
          ))}
        </div>
      </div>
    </section>
  );
}
