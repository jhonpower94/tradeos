import { useEffect, useState } from 'react';
import IconButton from '@mui/joy/IconButton';
import { useColorScheme } from '@mui/joy/styles';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';

export function ColorModeToggle() {
  const { mode, setMode, systemMode } = useColorScheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolved = mode === 'system' ? systemMode : mode;
  const isDark = resolved === 'dark';

  return (
    <IconButton
      variant="soft"
      color="neutral"
      disabled={!mounted}
      onClick={() => setMode(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {mounted && isDark ? <LightModeRounded /> : <DarkModeRounded />}
    </IconButton>
  );
}
