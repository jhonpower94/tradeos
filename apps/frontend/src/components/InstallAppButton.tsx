import { useState } from 'react';
import Button from '@mui/joy/Button';
import AddToHomeScreenOutlined from '@mui/icons-material/AddToHomeScreenOutlined';
import GetAppOutlined from '@mui/icons-material/GetAppOutlined';
import { IosHomeScreenGuideDrawer } from './IosHomeScreenGuide';
import { usePwaInstall } from '../hooks/usePwaInstall';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'soft' | 'outlined' | 'plain';
  color?: 'primary' | 'neutral' | 'warning';
  fullWidth?: boolean;
  /** Called after a successful Chromium install accept. */
  onInstalled?: () => void;
};

/**
 * Install / Add to Home Screen control.
 * Chromium: native beforeinstallprompt. iOS: opens instruction drawer.
 */
export function InstallAppButton({
  size = 'sm',
  variant = 'soft',
  color = 'primary',
  fullWidth,
  onInstalled,
}: Props) {
  const { showInstallCta, canPromptInstall, needsIosGuide, promptInstall } = usePwaInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!showInstallCta) return null;

  const label = needsIosGuide ? 'Add to Home Screen' : 'Install app';
  const startIcon = needsIosGuide ? <AddToHomeScreenOutlined /> : <GetAppOutlined />;

  const onClick = async () => {
    if (needsIosGuide || !canPromptInstall) {
      setGuideOpen(true);
      return;
    }
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') onInstalled?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        color={color}
        fullWidth={fullWidth}
        loading={busy}
        startDecorator={startIcon}
        onClick={() => void onClick()}
      >
        {label}
      </Button>
      <IosHomeScreenGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
