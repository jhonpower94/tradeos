import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { isIosDevice, isStandaloneDisplay } from '../lib/webPush';

/** Chromium BeforeInstallPromptEvent (not in all TS DOM libs). */
export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEventLike | null = null;
let installed = typeof window !== 'undefined' ? isStandaloneDisplay() : false;
/** Bumped on every store change so useSyncExternalStore can compare by identity. */
let version = 0;
const listeners = new Set<Listener>();
let listening = false;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function ensureListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEventLike;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });

  const mq = window.matchMedia('(display-mode: standalone)');
  const syncInstalled = () => {
    const next = isStandaloneDisplay();
    if (next !== installed) {
      installed = next;
      if (next) deferredPrompt = null;
      emit();
    }
  };
  mq.addEventListener?.('change', syncInstalled);
  syncInstalled();
}

function subscribe(listener: Listener) {
  ensureListening();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion() {
  ensureListening();
  return version;
}

export type PwaInstallState = {
  isInstalled: boolean;
  canPromptInstall: boolean;
  needsIosGuide: boolean;
  showInstallCta: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
};

export function usePwaInstall(): PwaInstallState {
  useSyncExternalStore(subscribe, getVersion, () => 0);

  const [ios, setIos] = useState(false);
  useEffect(() => {
    setIos(isIosDevice());
  }, []);

  const isInstalled = installed;
  const needsIosGuide = !isInstalled && ios;
  const canPromptInstall = Boolean(deferredPrompt) && !isInstalled;

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt;
    if (!event) return 'unavailable' as const;
    deferredPrompt = null;
    emit();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      installed = true;
      emit();
    }
    return outcome;
  }, []);

  return {
    isInstalled,
    canPromptInstall,
    needsIosGuide,
    showInstallCta: !isInstalled && (canPromptInstall || needsIosGuide),
    promptInstall,
  };
}
