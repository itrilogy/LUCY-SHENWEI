/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
        },
        accent: 'var(--product-accent)',
        highlight: 'var(--color-highlight)',
        cyan: 'var(--luxi-cyan)',
        gold: 'var(--luxi-gold)',
        page: 'var(--bg-page)',
        card: 'var(--bg-card)',
        raised: 'var(--bg-raised)',
        sunken: 'var(--bg-sunken)',
        fg: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        secondary: 'var(--text-secondary)',
        inverse: 'var(--text-inverse)',
        line: 'var(--border-line)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        ok: 'var(--text-ok, var(--state-up))',
        down: 'var(--state-down)',
        flat: 'var(--state-flat)',
        indigo: {
          50: 'color-mix(in oklab, var(--product-accent) 12%, white)',
          100: 'color-mix(in oklab, var(--product-accent) 18%, white)',
          200: 'color-mix(in oklab, var(--product-accent) 28%, white)',
          300: 'color-mix(in oklab, var(--product-accent) 42%, white)',
          400: 'var(--product-accent)',
          500: 'var(--color-primary-hover)',
          600: 'var(--color-primary)',
          700: 'var(--color-primary-active)',
          800: '#0A4A33',
          900: '#1A2428',
        },
      },
      fontFamily: {
        sans: ['PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      height: {
        header: '56px',
        control: 'var(--density-control)',
      },
      width: {
        sidebar: '240px',
      },
      spacing: {
        header: '56px',
        sidebar: '240px',
      },
    },
  },
  plugins: [],
}
