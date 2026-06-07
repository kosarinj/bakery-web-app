export const THEMES = [
  {
    key: 'purple',
    label: 'Purple',
    vars: {
      '--primary': '#7c3aed', '--primary-dark': '#6d28d9', '--primary-light': '#ede9fe',
      '--nav-bg': '#1e293b', '--nav-accent': '#a78bfa',
    }
  },
  {
    key: 'bakery',
    label: 'Warm Bakery',
    vars: {
      '--primary': '#92400e', '--primary-dark': '#78350f', '--primary-light': '#fef3c7',
      '--nav-bg': '#3a1f0e', '--nav-accent': '#fbbf24',
    }
  },
  {
    key: 'forest',
    label: 'Forest',
    vars: {
      '--primary': '#166534', '--primary-dark': '#14532d', '--primary-light': '#dcfce7',
      '--nav-bg': '#052e16', '--nav-accent': '#4ade80',
    }
  },
  {
    key: 'ocean',
    label: 'Ocean',
    vars: {
      '--primary': '#1d4ed8', '--primary-dark': '#1e40af', '--primary-light': '#dbeafe',
      '--nav-bg': '#0f172a', '--nav-accent': '#60a5fa',
    }
  },
  {
    key: 'slate',
    label: 'Slate',
    vars: {
      '--primary': '#475569', '--primary-dark': '#334155', '--primary-light': '#f1f5f9',
      '--nav-bg': '#0f172a', '--nav-accent': '#94a3b8',
    }
  },

  // ── Gradient themes ──────────────────────────────────────────────
  {
    key: 'sunset',
    label: 'Sunset',
    gradient: true,
    vars: {
      '--primary': '#e11d48', '--primary-dark': '#be123c', '--primary-light': '#ffe4e6',
      '--nav-bg': '#1c0408',
      '--nav-gradient': 'linear-gradient(180deg, #7c1d2d 0%, #3d0a15 50%, #1c0408 100%)',
      '--header-bg': '#7c1d2d',
      '--nav-accent': '#fb7185',
    }
  },
  {
    key: 'aurora',
    label: 'Aurora',
    gradient: true,
    vars: {
      '--primary': '#0d9488', '--primary-dark': '#0f766e', '--primary-light': '#ccfbf1',
      '--nav-bg': '#080d14',
      '--nav-gradient': 'linear-gradient(160deg, #0d4f6b 0%, #0a2642 40%, #1a0d40 100%)',
      '--header-bg': '#0d4f6b',
      '--nav-accent': '#2dd4bf',
    }
  },
  {
    key: 'midnight',
    label: 'Midnight Bloom',
    gradient: true,
    vars: {
      '--primary': '#9333ea', '--primary-dark': '#7e22ce', '--primary-light': '#f5f3ff',
      '--nav-bg': '#020006',
      '--nav-gradient': 'linear-gradient(180deg, #1e0a42 0%, #0c0520 60%, #020006 100%)',
      '--header-bg': '#1e0a42',
      '--nav-accent': '#c084fc',
    }
  },
  {
    key: 'rosegold',
    label: 'Rose Gold',
    gradient: true,
    vars: {
      '--primary': '#be185d', '--primary-dark': '#9d174d', '--primary-light': '#fce7f3',
      '--nav-bg': '#1a0510',
      '--nav-gradient': 'linear-gradient(180deg, #6d1a3a 0%, #3d0d20 50%, #1a0510 100%)',
      '--header-bg': '#6d1a3a',
      '--nav-accent': '#f9a8d4',
    }
  },
  {
    key: 'sage',
    label: 'Sage Drift',
    gradient: true,
    vars: {
      '--primary': '#4d7c0f', '--primary-dark': '#3f6212', '--primary-light': '#f7fee7',
      '--nav-bg': '#071209',
      '--nav-gradient': 'linear-gradient(180deg, #1e3a10 0%, #112208 50%, #071209 100%)',
      '--header-bg': '#1e3a10',
      '--nav-accent': '#86efac',
    }
  },
  {
    key: 'dusk',
    label: 'Dusk',
    gradient: true,
    vars: {
      '--primary': '#c2410c', '--primary-dark': '#9a3412', '--primary-light': '#fff7ed',
      '--nav-bg': '#0d0a06',
      '--nav-gradient': 'linear-gradient(160deg, #7c3009 0%, #3d1a04 40%, #150a02 80%, #0d0a06 100%)',
      '--header-bg': '#7c3009',
      '--nav-accent': '#fb923c',
    }
  },
]

// All CSS variables that themes may set — used to clean up when switching
export const ALL_THEME_VARS = [
  '--primary', '--primary-dark', '--primary-light',
  '--nav-bg', '--nav-gradient', '--nav-accent', '--header-bg',
]

export function applyTheme(key) {
  const theme = THEMES.find(t => t.key === key) || THEMES[0]
  const root = document.documentElement
  // Clear all possible theme variables first so switching away from a gradient theme works
  ALL_THEME_VARS.forEach(v => root.style.removeProperty(v))
  // Apply new theme
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  localStorage.setItem('bakery-theme', key)
}
