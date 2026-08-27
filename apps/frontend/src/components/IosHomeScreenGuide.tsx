import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Drawer from '@mui/joy/Drawer';
import ModalClose from '@mui/joy/ModalClose';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import AddToHomeScreenOutlined from '@mui/icons-material/AddToHomeScreenOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import TouchAppOutlined from '@mui/icons-material/TouchAppOutlined';
import type { ReactNode } from 'react';

const STEPS: Array<{
  step: number;
  icon: ReactNode;
  title: string;
  detail: string;
}> = [
  {
    step: 1,
    icon: <IosShareOutlined fontSize="small" />,
    title: 'Tap Share',
    detail: 'In Safari or Chrome, open the share sheet.',
  },
  {
    step: 2,
    icon: <AddToHomeScreenOutlined fontSize="small" />,
    title: 'Add to Home Screen',
    detail: 'Choose Add to Home Screen, then Add.',
  },
  {
    step: 3,
    icon: <TouchAppOutlined fontSize="small" />,
    title: 'Open the app icon',
    detail: 'Launch Trading OS from your Home Screen.',
  },
  {
    step: 4,
    icon: <NotificationsActiveOutlined fontSize="small" />,
    title: 'Enable notifications',
    detail: 'Open Settings → Notifications and enable Web Push.',
  },
];

/** Responsive step grid used inline or inside the install guide drawer. */
export function IosHomeScreenSteps({
  accent = 'primary',
}: {
  accent?: 'primary' | 'warning';
}) {
  const softBg = accent === 'warning' ? 'warning.softBg' : 'primary.softBg';
  const softColor = accent === 'warning' ? 'warning.plainColor' : 'primary.plainColor';

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.25,
        gridTemplateColumns: {
          xs: '1fr',
          sm: '1fr 1fr',
        },
      }}
    >
      {STEPS.map((item) => (
        <Sheet
          key={item.step}
          variant="outlined"
          sx={{
            p: 1.5,
            borderRadius: 'md',
            bgcolor: 'background.surface',
            display: 'flex',
            gap: 1.25,
            alignItems: 'flex-start',
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 'md',
              display: 'grid',
              placeItems: 'center',
              bgcolor: softBg,
              color: softColor,
            }}
          >
            {item.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.15 }}>
              Step {item.step}
            </Typography>
            <Typography level="title-sm" sx={{ mb: 0.25 }}>
              {item.title}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              {item.detail}
            </Typography>
          </Box>
        </Sheet>
      ))}
    </Box>
  );
}

type GuideDrawerProps = {
  open: boolean;
  onClose: () => void;
};

/** Bottom sheet drawer with Add to Home Screen instructions for iOS. */
export function IosHomeScreenGuideDrawer({ open, onClose }: GuideDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="bottom"
      size="md"
      slotProps={{
        content: {
          sx: {
            borderTopLeftRadius: 'xl',
            borderTopRightRadius: 'xl',
            maxHeight: { xs: '92dvh', sm: '85vh' },
            pb: { xs: 'max(1.5rem, env(safe-area-inset-bottom))', sm: 2 },
          },
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 4,
          borderRadius: 'lg',
          bgcolor: 'neutral.outlinedBorder',
          mx: 'auto',
          mt: 1.25,
          mb: 0.5,
        }}
      />
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 1,
          pb: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0, pr: 1 }}>
          <Typography level="title-lg">Add to Home Screen</Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Required on iPhone and iPad for Web Push. Install once, then open Trading OS from the
            Home Screen icon.
          </Typography>
        </Box>
        <ModalClose variant="plain" sx={{ position: 'relative', top: -4, right: -4 }} />
      </Box>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: 2, overflow: 'auto' }}>
        <IosHomeScreenSteps accent="primary" />
        <Button fullWidth sx={{ mt: 2.5 }} variant="soft" color="neutral" onClick={onClose}>
          Got it
        </Button>
      </Box>
    </Drawer>
  );
}
