import { createTheme, alpha } from '@mui/material/styles';

const fontSans = '"IBM Plex Sans", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
const fontMono = '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace';

const surface = {
  base: '#080B10',
  raised: '#0E141C',
  overlay: '#141C27',
  border: 'rgba(148, 168, 190, 0.12)',
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: surface.base,
      paper: surface.raised,
    },
    primary: {
      main: '#2DD4A7',
      light: '#5FE6C4',
      dark: '#17A883',
      contrastText: '#04120D',
    },
    secondary: {
      main: '#4FA3E3',
      light: '#7CC0EE',
      dark: '#2D77B0',
      contrastText: '#04121D',
    },
    long: {
      main: '#2DD4A7',
      light: '#5FE6C4',
      dark: '#17A883',
      contrastText: '#04120D',
    },
    short: {
      main: '#FF6B5E',
      light: '#FF9186',
      dark: '#D6473B',
      contrastText: '#1A0704',
    },
    neutral: {
      main: '#94A8BE',
      light: '#B7C6D6',
      dark: '#66788B',
      contrastText: '#04090D',
    },
    success: {
      main: '#2DD4A7',
    },
    error: {
      main: '#FF6B5E',
    },
    warning: {
      main: '#F0B54D',
    },
    info: {
      main: '#4FA3E3',
    },
    text: {
      primary: '#E7EEF5',
      secondary: '#8598AC',
      disabled: '#4E5C6E',
    },
    divider: surface.border,
    surface,
  },
  typography: {
    fontFamily: fontSans,
    fontSize: 13,
    h1: { fontFamily: fontSans, fontWeight: 600, fontSize: '2.2rem', letterSpacing: -0.5 },
    h2: { fontFamily: fontSans, fontWeight: 600, fontSize: '1.8rem', letterSpacing: -0.4 },
    h3: { fontFamily: fontSans, fontWeight: 600, fontSize: '1.4rem', letterSpacing: -0.2 },
    h4: { fontFamily: fontSans, fontWeight: 600, fontSize: '1.15rem' },
    h5: { fontFamily: fontSans, fontWeight: 600, fontSize: '1rem' },
    h6: { fontFamily: fontSans, fontWeight: 600, fontSize: '0.9rem' },
    subtitle1: { fontSize: '0.85rem', fontWeight: 500, color: '#8598AC' },
    subtitle2: { fontSize: '0.75rem', fontWeight: 500, color: '#8598AC', textTransform: 'uppercase', letterSpacing: 0.6 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.7rem', color: '#66788B' },
    button: { textTransform: 'none', fontWeight: 600 },
    mono: { fontFamily: fontMono, fontFeatureSettings: '"tnum"' },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: surface.base,
          backgroundImage:
            'radial-gradient(circle at 15% 0%, rgba(45, 212, 167, 0.05), transparent 40%), radial-gradient(circle at 85% 0%, rgba(79, 163, 227, 0.05), transparent 40%)',
          scrollbarColor: `${alpha('#8598AC', 0.35)} transparent`,
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: alpha('#8598AC', 0.25),
          borderRadius: 8,
        },
        '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${surface.border}`,
        },
        rounded: { borderRadius: 10 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(surface.raised, 0.9),
          backgroundImage: 'none',
          borderBottom: `1px solid ${surface.border}`,
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: surface.raised,
          backgroundImage: 'none',
          borderRight: `1px solid ${surface.border}`,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${surface.border}`,
          padding: '8px 12px',
          fontSize: '0.8125rem',
        },
        head: {
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#8598AC',
          backgroundColor: surface.raised,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: alpha('#94A8BE', 0.05),
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600 },
        containedPrimary: {
          '&:hover': { backgroundColor: '#26B893' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 5 },
        label: { paddingLeft: 8, paddingRight: 8 },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
    },
    MuiFormControl: {
      defaultProps: { size: 'small' },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: surface.raised,
          backgroundImage: 'none',
          border: `1px solid ${surface.border}`,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2, borderRadius: 1 },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 6 },
      },
    },
  },
});
