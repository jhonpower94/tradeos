import { extendTheme } from '@mui/joy/styles';

const fontSans = '"Sora", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif';
const fontMono = '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace';

const blue = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
};

const jade = {
  50: '#E8F8F1',
  100: '#C5EEDC',
  200: '#8FDCB8',
  300: '#4FC48C',
  400: '#22A86C',
  500: '#0D9F6E',
  600: '#0B7F58',
  700: '#0A6447',
  800: '#0A4C37',
  900: '#073226',
};

const rose = {
  50: '#FFF0F1',
  100: '#FFD6DA',
  200: '#F9A8B0',
  300: '#F0717C',
  400: '#E5484D',
  500: '#D92D32',
  600: '#BA1F2A',
  700: '#961822',
  800: '#6F141B',
  900: '#3F0C10',
};

const sand = {
  50: '#FFF8EB',
  100: '#FBE9C6',
  200: '#F5D48A',
  300: '#E8BE5A',
  400: '#D4A017',
  500: '#B8890E',
  600: '#916C0C',
  700: '#6E520B',
  800: '#4A380A',
  900: '#2C2207',
};

export const theme = extendTheme({
  cssVarPrefix: 'joy',
  fontFamily: {
    display: fontSans,
    body: fontSans,
    code: fontMono,
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '0.9375rem',
    lg: '1.0625rem',
    xl: '1.25rem',
    xl2: '1.5rem',
    xl3: '1.875rem',
    xl4: '2.25rem',
  },
  radius: {
    xs: '6px',
    sm: '10px',
    md: '14px',
    lg: '20px',
    xl: '28px',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: blue,
        success: jade,
        danger: rose,
        warning: sand,
        background: {
          body: '#F3F6FA',
          surface: '#FFFFFF',
          popup: '#FFFFFF',
          level1: '#FFFFFF',
          level2: '#EEF2F7',
          level3: '#E4EAF2',
        },
        text: {
          primary: '#102033',
          secondary: '#5B6B7C',
          tertiary: '#8493A3',
        },
        divider: 'rgba(16, 32, 51, 0.08)',
        neutral: {
          50: '#F7F9FC',
          100: '#EEF2F7',
          200: '#D8E0EA',
          300: '#B7C3D1',
          400: '#8493A3',
          500: '#5B6B7C',
          600: '#3E4D5C',
          700: '#2A3846',
          800: '#1A2530',
          900: '#102033',
          outlinedBorder: 'rgba(16, 32, 51, 0.1)',
        },
      },
    },
    dark: {
      palette: {
        primary: blue,
        success: jade,
        danger: rose,
        warning: sand,
        background: {
          body: '#0A1018',
          surface: '#121A24',
          popup: '#18222E',
          level1: '#121A24',
          level2: '#18222E',
          level3: '#1F2B3A',
        },
        text: {
          primary: '#E8EEF6',
          secondary: '#8B9BB0',
          tertiary: '#66788B',
        },
        divider: 'rgba(148, 168, 190, 0.12)',
        neutral: {
          50: '#F4F7FA',
          100: '#E7EEF5',
          200: '#B7C6D6',
          300: '#94A8BE',
          400: '#8B9BB0',
          500: '#66788B',
          600: '#4E5C6E',
          700: '#354150',
          800: '#1F2B3A',
          900: '#0A1018',
          outlinedBorder: 'rgba(148, 168, 190, 0.16)',
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
          '--Button-radius': '12px',
          '--Button-gap': '8px',
        },
      },
    },
    JoyIconButton: {
      defaultProps: { size: 'sm' },
      styleOverrides: {
        root: { '--IconButton-radius': '12px' },
      },
    },
    JoyInput: {
      defaultProps: { size: 'md' },
      styleOverrides: {
        root: { '--Input-radius': '12px' },
      },
    },
    JoySelect: {
      defaultProps: { size: 'md' },
      styleOverrides: {
        root: { '--Select-radius': '12px' },
      },
    },
    JoyTextarea: {
      defaultProps: { size: 'md' },
    },
    JoyChip: {
      defaultProps: { size: 'sm' },
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: '8px' },
      },
    },
    JoyCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          '--Card-radius': '18px',
          '--Card-padding': '20px',
          backgroundColor: 'var(--joy-palette-background-surface)',
          boxShadow: 'none',
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
      defaultProps: { size: 'md', hoverRow: true },
      styleOverrides: {
        root: {
          '--TableCell-headBackground': 'var(--joy-palette-background-surface)',
          '--TableCell-paddingX': '16px',
          '--TableCell-paddingY': '14px',
          '& thead th': {
            fontSize: '0.72rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            color: 'var(--joy-palette-text-secondary)',
          },
          '& tbody td': {
            fontSize: '0.875rem',
          },
        },
      },
    },
    JoyTabs: {
      defaultProps: { size: 'md' },
    },
    JoyListItemButton: {
      styleOverrides: {
        root: {
          '--ListItem-radius': '12px',
          minHeight: 44,
        },
      },
    },
    JoyLinearProgress: {
      styleOverrides: {
        root: {
          '--LinearProgress-radius': '6px',
          '--LinearProgress-thickness': '8px',
        },
      },
    },
  },
});

export const MODE_STORAGE_KEY = 'trading-os-mode';

export const monoSx = {
  fontFamily: 'var(--joy-fontFamily-code)',
  fontFeatureSettings: '"tnum"',
} as const;
