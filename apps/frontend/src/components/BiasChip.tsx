import Chip from '@mui/joy/Chip';
import Tooltip from '@mui/joy/Tooltip';

export function BiasChip({
  aligned,
  suggestion,
  message,
}: {
  aligned: boolean;
  suggestion: string;
  message?: string;
}) {
  const consider = suggestion === 'consider_close' || !aligned;
  const chip = (
    <Chip size="sm" variant="soft" color={consider ? 'warning' : 'success'}>
      {consider ? 'Consider close' : 'Aligned'}
    </Chip>
  );

  return message ? (
    <Tooltip title={message} size="sm">
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
