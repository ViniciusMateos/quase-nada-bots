/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identidade Quase Nada Bots (theme.ts do app): roxo → rosa → amarelo, tema escuro.
        // Tokens via CSS vars (index.css) pra casar com o <alpha-value> do Tailwind.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-light': 'rgb(var(--primary-light) / <alpha-value>)',
        roxo: 'rgb(var(--roxo) / <alpha-value>)',
        amarelo: 'rgb(var(--amarelo) / <alpha-value>)',
        txt: 'rgb(var(--txt) / <alpha-value>)',
        'txt-dim': 'rgb(var(--txt-dim) / <alpha-value>)',
        'txt-faint': 'rgb(var(--txt-faint) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      backgroundImage: {
        marca: 'linear-gradient(135deg, rgb(var(--roxo)) 0%, rgb(var(--primary)) 55%, rgb(var(--amarelo)) 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgb(var(--primary) / 0.4), 0 8px 30px -8px rgb(var(--primary) / 0.5)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulso: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        pulso: 'pulso 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
