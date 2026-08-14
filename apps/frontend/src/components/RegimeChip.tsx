import Chip from '@mui/joy/Chip';
import type { ColorPaletteProp } from '@mui/joy/styles';

const REGIME_LABEL: Record<string, string> = {
  trending_bull: 'Trending Bull',
  trending_bear: 'Trending Bear',
  ranging: 'Ranging',
  volatile: 'Volatile',
  compression: 'Compression',
  trending_volatile: 'Trending Volatile',
  unknown: 'Unknown',
};

function regimeColor(regime: string): ColorPaletteProp {
  if (regime === 'trending_bull') return 'success';
  if (regime === 'trending_bear') return 'danger';
  if (regime === 'volatile' || regime === 'trending_volatile') return 'warning';
  if (regime === 'compression') return 'primary';
  return 'neutral';
}

export function RegimeChip({ regime }: { regime: string }) {
  return (
    <Chip size="sm" variant="soft" color={regimeColor(regime)}>
      {REGIME_LABEL[regime] ?? regime}
    </Chip>
  );
}
