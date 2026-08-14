import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Semantic color system - reference CSS variables
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
          subtle: "hsl(var(--primary-subtle))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          subtle: "hsl(var(--secondary-subtle))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          subtle: "hsl(var(--destructive-subtle))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          subtle: "hsl(var(--success-subtle))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          subtle: "hsl(var(--warning-subtle))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          subtle: "hsl(var(--accent-subtle))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          elevated: "hsl(var(--card-elevated))",
        },
        
        // Sidebar specific
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "9999px",
      },
      
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      
      fontSize: {
        'display-xl': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-lg': ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-md': ['clamp(1.5rem, 3vw, 2.25rem)', { lineHeight: '1.15', fontWeight: '600' }],
        'heading-lg': ['clamp(1.25rem, 2.5vw, 1.75rem)', { lineHeight: '1.2', fontWeight: '600' }],
        'heading-md': ['1.125rem', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-sm': ['1rem', { lineHeight: '1.35', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        'code': ['0.8125rem', { lineHeight: '1.55', fontFamily: 'var(--font-mono)' }],
        'code-sm': ['0.75rem', { lineHeight: '1.5', fontFamily: 'var(--font-mono)' }],
      },
      
      spacing: {
        '0': '0',
        'px': '1px',
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
        '28': '112px',
        '32': '128px',
        '36': '144px',
        '40': '160px',
        '44': '176px',
        '48': '192px',
        '52': '208px',
        '56': '224px',
        '60': '240px',
        '64': '256px',
        '72': '288px',
        '80': '320px',
        '96': '384px',
      },
      
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      
      lineHeight: {
        none: '1',
        tight: '1.1',
        snug: '1.25',
        normal: '1.5',
        relaxed: '1.625',
        loose: '2',
      },
      
      letterSpacing: {
        tighter: '-0.05em',
        tight: '-0.025em',
        normal: '0',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.1em',
      },
      
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-radial': 'var(--gradient-radial)',
        'gradient-mesh': 'var(--gradient-mesh)',
        'gradient-subtle': 'var(--gradient-subtle)',
        'grid-pattern': 'var(--grid-pattern)',
      },
      
      boxShadow: {
        'elevation-1': 'var(--shadow-elevation-1)',
        'elevation-2': 'var(--shadow-elevation-2)',
        'elevation-3': 'var(--shadow-elevation-3)',
        'elevation-4': 'var(--shadow-elevation-4)',
        'modal': 'var(--shadow-modal)',
        'glow': 'var(--shadow-glow)',
        'glow-subtle': 'var(--shadow-glow-subtle)',
        'inner': 'var(--shadow-inner)',
        'focus': 'var(--shadow-focus)',
      },
      
      transitionDuration: {
        'instant': '0ms',
        'fast': 'var(--motion-duration-fast)',
        'base': 'var(--motion-duration-base)',
        'slow': 'var(--motion-duration-slow)',
        'slower': 'var(--motion-duration-slower)',
      },
      
      transitionTimingFunction: {
        'standard': 'var(--motion-easing-standard)',
        'emphasized': 'var(--motion-easing-emphasized)',
        'decelerate': 'var(--motion-easing-decelerate)',
        'accelerate': 'var(--motion-easing-accelerate)',
        'spring': 'var(--motion-easing-spring)',
      },
      
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in var(--motion-duration-base) var(--motion-easing-decelerate)',
        'fade-out': 'fade-out var(--motion-duration-base) var(--motion-easing-accelerate)',
        'scale-in': 'scale-in var(--motion-duration-fast) var(--motion-easing-emphasized)',
        'scale-out': 'scale-out var(--motion-duration-fast) var(--motion-easing-accelerate)',
        'slide-in-from-top': 'slide-in-from-top var(--motion-duration-base) var(--motion-easing-decelerate)',
        'slide-in-from-bottom': 'slide-in-from-bottom var(--motion-duration-base) var(--motion-easing-decelerate)',
        'slide-in-from-left': 'slide-in-from-left var(--motion-duration-base) var(--motion-easing-decelerate)',
        'slide-in-from-right': 'slide-in-from-right var(--motion-duration-base) var(--motion-easing-decelerate)',
        'slide-out-to-top': 'slide-out-to-top var(--motion-duration-base) var(--motion-easing-accelerate)',
        'slide-out-to-bottom': 'slide-out-to-bottom var(--motion-duration-base) var(--motion-easing-accelerate)',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-glow': 'pulse-glow 2s var(--motion-easing-standard) infinite',
        'shimmer': 'shimmer 2s var(--motion-easing-standard) infinite',
      },
      
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'scale-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.95)' },
        },
        'slide-in-from-top': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-from-left': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-from-right': {
          from: { opacity: '0', transform: 'translateX(10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-out-to-top': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(-10px)' },
        },
        'slide-out-to-bottom': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      
      screens: {
        'xs': '480px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1400px',
        '3xl': '1680px',
      },
      
      zIndex: {
        'base': '0',
        'dropdown': '100',
        'sticky': '200',
        'fixed': '300',
        'modal-backdrop': '400',
        'modal': '500',
        'popover': '600',
        'tooltip': '700',
        'toast': '800',
        'command-palette': '900',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;