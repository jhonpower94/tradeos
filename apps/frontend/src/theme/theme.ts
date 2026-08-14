import { extendTheme } from '@mui/joy/styles';

const fontSans = '"IBM Plex Sans", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
const fontMono = '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace';

const teal = {
  50: '#E8FBF5',
  100: '#C5F5E6',
  200: '#9EECD4',
  300: '#5FE6C4',
  400: '#3DDCB4',
  500: '#2DD4A7',
  600: '#17A883',
  700: '#12856A',
  800: '#0C5C49',
  900: '#04120D',
};

const coral = {
  50: '#FFF1EF',
  100: '#FFD8D4',
  200: '#FFB3AB',
  300: '#FF9186',
  400: '#FF7A6E',
  500: '#FF6B5E',
  600: '#D6473B',
  700: '#B3352B',
  800: '#7A221C',
  900: '#1A0704',
};

const amber = {
  50: '#FDF6E8',
  100: '#FAE6C0',
  200: '#F6D394',
  300: '#F3C56E',
  400: '#F1BC5A',
  500: '#F0B54D',
  600: '#C9922E',
  700: '#9A6E1F',
  800: '#684812',
  900: '#2A1C06',
};

export const theme = extendTheme({
  cssVarPrefix: 'joy',
  fontFamily: {
    display: fontSans,
    body: fontSans,
    code: fontMono,
  },
  fontSize: {
    xs: '0.7rem',
    sm: '0.8125rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.15rem',
    xl2: '1.4rem',
    xl3: '1.8rem',
    xl4: '2.2rem',
  },
  radius: {
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '18px',
  },
  colorSchemes: {
    dark: {
      palette: {
        primary: teal,
        success: teal,
        danger: coral,
        warning: amber,
        background: {
          body: '#080B10',
          surface: '#0E141C',
          popup: '#141C27',
          level1: '#0E141C',
          level2: '#141C27',
          level3: '#1A2433',
        },
        text: {
          primary: '#E7EEF5',
          secondary: '#8598AC',
          tertiary: '#66788B',
        },
        divider: 'rgba(148, 168, 190, 0.12)',
        neutral: {
          50: '#F4F7FA',
          100: '#E7EEF5',
          200: '#B7C6D6',
          300: '#94A8BE',
          400: '#8598AC',
          500: '#66788B',
          600: '#4E5C6E',
          700: '#354150',
          800: '#1A2433',
          900: '#080B10',
          outlinedBorder: 'rgba(148, 168, 190, 0.18)',
        },
      },
    },
  },
  components: {
    JoyButton: {
      defaultProps: { size: 'sm' },
      styleOverrides: {
        root: {
          fontWeight: 600,
          '--Button-radius': '8px',
        },
      },
    },
    JoyIconButton: {
      defaultProps: { size: 'sm' },
    },
    JoyInput: {
      defaultProps: { size: 'sm' },
    },
    JoySelect: {
      defaultProps: { size: 'sm' },
    },
    JoyTextarea: {
      defaultProps: { size: 'sm' },
    },
    JoyChip: {
      defaultProps: { size: 'sm' },
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
    JoyCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          '--Card-radius': '12px',
          backgroundColor: 'var(--joy-palette-background-surface)',
        },
      },
    },
    JoySheet: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    JoyTable: {
      defaultProps: { size: 'sm', hoverRow: true },
      styleOverrides: {
        root: {
          '--TableCell-headBackground': 'var(--joy-palette-background-surface)',
          '--TableCell-paddingX': '12px',
          '--TableCell-paddingY': '8px',
          '& thead th': {
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--joy-palette-text-secondary)',
          },
          '& tbody td': {
            fontSize: '0.8125rem',
          },
        },
      },
    },
    JoyTabs: {
      defaultProps: { size: 'sm' },
    },
    JoyLinearProgress: {
      styleOverrides: {
        root: {
          '--LinearProgress-radius': '4px',
          '--LinearProgress-thickness': '6px',
        },
      },
    },
  },
});

export const monoSx = {
  fontFamily: 'var(--joy-fontFamily-code)',
  fontFeatureSettings: '"tnum"',
} as const;
