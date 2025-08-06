import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: `var(--radius)`,
        md: `calc(var(--radius) - 2px)`,
        sm: 'calc(var(--radius) - 4px)',
      },
      typography: ({ theme }) => ({
        invert: {
          css: {
            '--tw-prose-body': theme('colors.neutral[300]'),
            '--tw-prose-headings': theme('colors.white'),
            '--tw-prose-lead': theme('colors.neutral[400]'),
            '--tw-prose-links': theme('colors.blue[400]'),
            '--tw-prose-bold': theme('colors.white'),
            '--tw-prose-counters': theme('colors.neutral[400]'),
            '--tw-prose-bullets': theme('colors.neutral[600]'),
            '--tw-prose-hr': theme('colors.neutral[800]'),
            '--tw-prose-quotes': theme('colors.neutral[200]'),
            '--tw-prose-quote-borders': theme('colors.neutral[700]'),
            '--tw-prose-captions': theme('colors.neutral[400]'),
            '--tw-prose-code': theme('colors.cyan[300]'),
            '--tw-prose-pre-code': theme('colors.neutral[200]'),
            '--tw-prose-pre-bg': 'rgba(38, 38, 38, 0.5)',
            '--tw-prose-th-borders': theme('colors.neutral[700]'),
            '--tw-prose-td-borders': theme('colors.neutral[800]'),
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            'h2': {
              'borderBottom': `1px solid ${theme('colors.neutral.800')}`,
              'paddingBottom': theme('spacing.2'),
              'marginTop': theme('spacing.10'),
              'marginBottom': theme('spacing.6'),
            },
            'h3': {
               'marginTop': theme('spacing.8'),
               'marginBottom': theme('spacing.4'),
            },
            'strong': {
              color: theme('colors.white'),
              fontWeight: '600',
            },
            'pre': {
              border: `1px solid ${theme('colors.neutral.800')}`,
              borderRadius: theme('borderRadius.lg'),
            },
            'ul > li::marker': {
                color: theme('colors.neutral.500'),
            },
            'ol > li::marker': {
                color: theme('colors.neutral.500'),
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

export default config
