/**
 * Setup Suite - Neobrutalist Design System
 *
 * A unified design system for Space, Unbox, and Specs apps.
 * Features bold typography, thick borders, hard shadows, and a warm color palette.
 */

export const theme = {
  colors: {
    // Legacy flat colors (for backwards compatibility)
    bg: "#F3EDDF",
    surface: "#F7F1E2",
    surfaceAlt: "#E9E1CF",

    // Text colors
    ink: "#2B2A28",
    text: "#2B2A28",
    textMuted: "#6C5F4E",
    textDisabled: "#A39A90",

    // Border
    border: "#2B2A28",
    borderLight: "#3a3a3a",

    // Accent colors
    accent: "#D97A2B",
    accentSoft: "#E7A56E",
    accentHover: "#E6782E",

    // Semantic colors
    success: "#3B8C4A",
    warn: "#B8860B",
    danger: "#B23A2E",
    info: "#2B6CB0",

    // Dark mode variants
    dark: {
      bg: "#0f0c09",
      surface: "#1f1c17",
      surfaceAlt: "#252219",
      ink: "#f5f3f0",
      text: "#f5f3f0",
      textMuted: "#a0998f",
      textDisabled: "#5a5550",
      border: "#2B2A28",
      accent: "#D97A2B",
      accentSoft: "#E7A56E",
    },
  },

  // Legacy fontStack (for backwards compatibility)
  fontStack: "'Space Grotesk', 'Sometype Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",

  // Typography
  typography: {
    fontFamily: {
      primary: "'Space Grotesk', 'Sometype Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      mono: "'Sometype Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    },
    fontSize: {
      xs: "0.75rem",    // 12px
      sm: "0.875rem",   // 14px
      base: "1rem",     // 16px
      lg: "1.125rem",   // 18px
      xl: "1.25rem",    // 20px
      "2xl": "1.5rem",  // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    },
    lineHeight: {
      tight: 1.1,
      snug: 1.25,
      normal: 1.5,
      relaxed: 1.625,
    },
  },

  // Spacing scale (in rem)
  spacing: {
    px: "1px",
    0: "0",
    0.5: "0.125rem",  // 2px
    1: "0.25rem",     // 4px
    1.5: "0.375rem",  // 6px
    2: "0.5rem",      // 8px
    2.5: "0.625rem",  // 10px
    3: "0.75rem",     // 12px
    3.5: "0.875rem",  // 14px
    4: "1rem",        // 16px
    5: "1.25rem",     // 20px
    6: "1.5rem",      // 24px
    8: "2rem",        // 32px
    10: "2.5rem",     // 40px
    12: "3rem",       // 48px
    16: "4rem",       // 64px
  },

  // Border radius (legacy: number for backwards compatibility)
  radius: 10,

  // Border radius scale
  radii: {
    none: "0",
    sm: "4px",
    md: "8px",
    lg: "10px",      // Default for neobrutalist
    xl: "12px",
    "2xl": "16px",
    full: "9999px",
  },

  // Border width
  borderWidth: {
    thin: "1.5px",
    default: "2px",
    thick: "3px",
    heavy: "4px",
  },

  // Hard shadows (neobrutalist style)
  shadows: {
    sm: "2px 2px 0 #2B2A28",
    md: "4px 4px 0 #2B2A28",
    lg: "6px 6px 0 #2B2A28",
    xl: "8px 8px 0 #2B2A28",
    // Colored shadows
    accent: "4px 4px 0 #D97A2B",
    danger: "4px 4px 0 #B23A2E",
    // Inset shadows (for pressed states)
    inset: "inset 2px 2px 0 #2B2A28",
  },

  // Transitions
  transitions: {
    fast: "120ms ease-out",
    normal: "160ms ease-out",
    slow: "240ms ease-out",
    // Specific transitions
    hover: "all 120ms ease-out",
    focus: "all 160ms ease-out",
    panel: "all 200ms ease-out",
  },

  // Z-index scale
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    overlay: 500,
    modal: 1000,
    popover: 1100,
    tooltip: 1200,
    toast: 1300,
  },

  // Breakpoints
  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
} as const;

// Type exports for TypeScript
export type Theme = typeof theme;
export type ThemeColors = typeof theme.colors;
export type ThemeTypography = typeof theme.typography;

// CSS custom properties generator
export function generateCSSVariables(): string {
  return `
:root {
  /* Colors */
  --color-bg: ${theme.colors.bg};
  --color-surface: ${theme.colors.surface};
  --color-surface-alt: ${theme.colors.surfaceAlt};
  --color-ink: ${theme.colors.ink};
  --color-text: ${theme.colors.text};
  --color-text-muted: ${theme.colors.textMuted};
  --color-text-disabled: ${theme.colors.textDisabled};
  --color-border: ${theme.colors.border};
  --color-accent: ${theme.colors.accent};
  --color-accent-soft: ${theme.colors.accentSoft};
  --color-accent-hover: ${theme.colors.accentHover};
  --color-success: ${theme.colors.success};
  --color-warn: ${theme.colors.warn};
  --color-danger: ${theme.colors.danger};
  --color-info: ${theme.colors.info};

  /* Typography */
  --font-family: ${theme.typography.fontFamily.primary};
  --font-family-mono: ${theme.typography.fontFamily.mono};

  /* Spacing */
  --radius-default: ${theme.radii.lg};
  --border-default: ${theme.borderWidth.default};

  /* Shadows */
  --shadow-sm: ${theme.shadows.sm};
  --shadow-md: ${theme.shadows.md};
  --shadow-lg: ${theme.shadows.lg};

  /* Transitions */
  --transition-fast: ${theme.transitions.fast};
  --transition-normal: ${theme.transitions.normal};
}

.dark-mode {
  --color-bg: ${theme.colors.dark.bg};
  --color-surface: ${theme.colors.dark.surface};
  --color-surface-alt: ${theme.colors.dark.surfaceAlt};
  --color-ink: ${theme.colors.dark.ink};
  --color-text: ${theme.colors.dark.text};
  --color-text-muted: ${theme.colors.dark.textMuted};
  --color-text-disabled: ${theme.colors.dark.textDisabled};
}
`;
}

export default theme;
