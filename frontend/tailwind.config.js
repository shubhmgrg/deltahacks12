/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // SkySync brand colors derived from logo
        // SkySync Aviation Theme
        background: "#020617", // Slate 950
        foreground: "#f8fafc", // Slate 50

        // Primary Accent (Electric Blue)
        primary: {
          DEFAULT: "#3b82f6",
          foreground: "white",
        },
        // Secondary / Surface
        secondary: {
          DEFAULT: "#1e293b", // Slate 800
          foreground: "#f8fafc",
        },
        // Muted / Inactive
        muted: {
          DEFAULT: "#0f172a", // Slate 900
          foreground: "#94a3b8", // Slate 400
        },
        // Success (Emerald)
        success: {
          DEFAULT: "#10b981", // Emerald 500
          foreground: "white",
        },
        // Warning (Amber)
        warning: {
          DEFAULT: "#fbbf24", // Amber 400
          foreground: "#020617",
        },
        // Destructive
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "white",
        },

        // Semantic aliases
        accent: "#3b82f6",
        surface: "#1e293b",
        border: "#334155", // Slate 700

        // UI component colors
        popover: {
          DEFAULT: "#1e293b", // Slate 800
          foreground: "#f8fafc",
        },
        card: {
          DEFAULT: "#1e293b", // Slate 800
          foreground: "#f8fafc",
        },
        input: "#334155", // Slate 700
        ring: "#3b82f6", // Blue 500
        muted: {
          DEFAULT: "#0f172a", // Slate 900
          foreground: "#94a3b8", // Slate 400
        },

        skysync: {
          500: '#3b82f6', // Alignment map
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glass': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      boxShadow: {
        'glow': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glass': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        'glow-sm': '0 0 10px rgba(59, 130, 246, 0.3)',
      },
    },
  },
  plugins: [],
}
