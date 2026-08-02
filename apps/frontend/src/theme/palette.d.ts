import type { PaletteColorOptions } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    long: Palette['primary'];
    short: Palette['primary'];
    neutral: Palette['primary'];
    surface: {
      base: string;
      raised: string;
      overlay: string;
      border: string;
    };
  }
  interface PaletteOptions {
    long?: PaletteColorOptions;
    short?: PaletteColorOptions;
    neutral?: PaletteColorOptions;
    surface?: {
      base: string;
      raised: string;
      overlay: string;
      border: string;
    };
  }
  interface TypographyVariants {
    mono: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    mono?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    mono: true;
  }
}
