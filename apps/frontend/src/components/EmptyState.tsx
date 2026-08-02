import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 8,
        color: 'text.secondary',
        textAlign: 'center',
      }}
    >
      {icon ?? <InboxOutlinedIcon sx={{ fontSize: 36, opacity: 0.5 }} />}
      <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
        {title}
      </Typography>
      {description && <Typography variant="body2">{description}</Typography>}
      {action}
    </Box>
  );
}
