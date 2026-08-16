import Chip from '@mui/joy/Chip';
import { deriveEntryTiming, type EntryTiming } from '@trading-os/shared';

const LABELS: Record<EntryTiming, string> = {
  early: 'Early',
  confirmed: 'Confirmed',
  mixed: 'Mixed',
};

const COLORS: Record<EntryTiming, 'primary' | 'neutral' | 'warning'> = {
  early: 'primary',
  confirmed: 'neutral',
  mixed: 'warning',
};

export function resolveEntryTiming(
  entryTiming: unknown,
  strategyIds: unknown,
): EntryTiming {
  if (entryTiming === 'early' || entryTiming === 'confirmed' || entryTiming === 'mixed') {
    return entryTiming;
  }
  const ids = Array.isArray(strategyIds) ? strategyIds.map(String) : [];
  return deriveEntryTiming(ids);
}

export function EntryTimingChip({
  entryTiming,
  strategyIds,
}: {
  entryTiming?: unknown;
  strategyIds?: unknown;
}) {
  const timing = resolveEntryTiming(entryTiming, strategyIds);
  const color = COLORS[timing];

  return (
    <Chip
      size="sm"
      variant="soft"
      color={color}
      sx={{
        '--Chip-minHeight': '26px',
        '--Chip-radius': '8px',
        fontWeight: 600,
        letterSpacing: 0.2,
      }}
    >
      {LABELS[timing]}
    </Chip>
  );
}
