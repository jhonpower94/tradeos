import Box from '@mui/joy/Box';
import Chip from '@mui/joy/Chip';

export function SideChip({ side }: { side: 'BUY' | 'SELL' | string }) {
  const isBuy = side === 'BUY' || side === 'LONG';
  const color = isBuy ? 'success' : 'danger';

  return (
    <Chip
      size="sm"
      variant="outlined"
      color={color}
      startDecorator={
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: `${color}.solidBg`,
          }}
        />
      }
      sx={{
        '--Chip-minHeight': '26px',
        '--Chip-radius': '8px',
        fontWeight: 600,
        letterSpacing: 0.2,
        bgcolor: `${color}.softBg`,
        borderColor: `${color}.outlinedBorder`,
      }}
    >
      {isBuy ? 'Buy' : 'Sell'}
    </Chip>
  );
}
