/**
 * OrchestreeAI Design System v2.2 - Design Tokens (PRD Bagian 5)
 */

export const colors = {
  light: {
    primaryGreen: '#1FA35A',
    primaryBlue: '#1E6FE0',
    accentPurple: '#6C4CD9',
    navy900: '#0B1B2B',
    surfaceBase: '#F2F5F7',
    gray600: '#5B6472',
    success: '#1FA35A',
    warning: '#F5A623',
    danger: '#E2483D',
    info: '#1E6FE0',
    glowAccent: 'transparent'
  },
  dark: {
    primaryGreen: '#34D399',
    primaryBlue: '#60A5FA',
    accentPurple: '#A78BFA',
    navy900: '#0B1B2B',
    surfaceBase: '#0B1220',
    gray600: '#9AA5B1',
    success: '#34D399',
    warning: '#F5A623',
    danger: '#F87171',
    info: '#60A5FA',
    glowAccent: 'rgba(96, 165, 250, 0.20)'
  }
} as const;

export const borderRadius = {
  sm: '12px',
  md: '16px',
  lg: '24px',
  full: '9999px'
} as const;

export const shadows = {
  orch1: '0 1px 2px 0 rgba(11, 27, 43, 0.06)',
  orch3: '0 8px 24px -4px rgba(11, 27, 43, 0.12)',
  orchGlow: '0 0 0 1px var(--orch-glow-accent, rgba(96, 165, 250, 0.20))'
} as const;

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px'
} as const;

export const typography = {
  displayLarge: {
    fontFamily: 'Poppins, Manrope, sans-serif',
    fontSize: '36px',
    lineHeight: '44px',
    fontWeight: '700'
  },
  headlineMedium: {
    fontFamily: 'Manrope, sans-serif',
    fontSize: '24px',
    lineHeight: '32px',
    fontWeight: '600'
  },
  titleLarge: {
    fontFamily: 'Manrope, sans-serif',
    fontSize: '18px',
    lineHeight: '26px',
    fontWeight: '600'
  },
  bodyLarge: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    lineHeight: '24px',
    fontWeight: '400'
  },
  bodyMedium: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: '400'
  },
  labelSmall: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: '500'
  }
} as const;
