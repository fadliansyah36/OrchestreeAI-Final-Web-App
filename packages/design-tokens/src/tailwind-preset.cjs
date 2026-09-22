/**
 * Tailwind Preset for OrchestreeAI (PRD v2.2 Bagian 5.3)
 */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'orch-green': 'var(--orch-primary-green, #1FA35A)',
        'orch-blue': 'var(--orch-primary-blue, #1E6FE0)',
        'orch-purple': 'var(--orch-accent-purple, #6C4CD9)',
        'orch-navy': 'var(--orch-navy-900, #0B1B2B)',
        'orch-surface': 'var(--orch-surface-base, #F2F5F7)',
        'orch-gray': 'var(--orch-gray-600, #5B6472)',
        'orch-success': 'var(--orch-success, #1FA35A)',
        'orch-warning': 'var(--orch-warning, #F5A623)',
        'orch-danger': 'var(--orch-danger, #E2483D)',
        'orch-info': 'var(--orch-info, #1E6FE0)'
      },
      borderRadius: {
        'orch-sm': '12px',
        'orch-md': '16px',
        'orch-lg': '24px'
      },
      boxShadow: {
        'orch-1': '0 1px 2px 0 rgba(11,27,43,0.06)',
        'orch-3': '0 8px 24px -4px rgba(11,27,43,0.12)',
        'orch-glow': '0 0 0 1px var(--orch-glow-accent, rgba(96,165,250,0.20))'
      },
      spacing: {
        'orch-1': '4px',
        'orch-2': '8px',
        'orch-3': '12px',
        'orch-4': '16px',
        'orch-6': '24px',
        'orch-8': '32px',
        'orch-12': '48px'
      }
    }
  }
};
