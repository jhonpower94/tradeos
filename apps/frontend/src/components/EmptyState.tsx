import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
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
        py: 6,
        color: 'text.secondary',
        textAlign: 'center',
        px: 2,
      }}
    >
      {icon ?? <InboxOutlinedIcon sx={{ fontSize: 36, opacity: 0.5 }} />}
      <Typography level="title-md" sx={{ color: 'text.primary' }}>
        {title}
      </Typography>
      {description && <Typography level="body-sm">{description}</Typography>}
      {action}
    </Box>
  );
}
