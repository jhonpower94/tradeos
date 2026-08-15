function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** iPhone / iPad (including iPadOS desktop UA). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ can report as Macintosh with touch
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** True when opened from Home Screen (or installed PWA). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Push API available in this browsing context (secure + PushManager). */
export function isPushApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function pushUnsupportedReason(): string | null {
  if (typeof window === 'undefined') return 'Web Push is unavailable';
  if (!window.isSecureContext) {
    return 'Web Push requires HTTPS (or localhost).';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (isIosDevice() && !isStandaloneDisplay()) {
      return 'On iPhone/iPad, add Trading OS to your Home Screen and open it from that icon before enabling Web Push.';
    }
    return 'Web Push is not available in this browser. On iPhone, use the Home Screen app (Safari or Chrome Add to Home Screen).';
  }
  return null;
}

export async function enableWebPush(opts: {
  getPublicKey: () => Promise<string>;
  subscribe: (sub: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }) => Promise<unknown>;
}): Promise<PushSubscription> {
  const reason = pushUnsupportedReason();
  if (reason) {
    throw new Error(reason);
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const publicKey = await opts.getPublicKey();
  const keyBytes = urlBase64ToUint8Array(publicKey);
  const keyBuffer = new ArrayBuffer(keyBytes.byteLength);
  new Uint8Array(keyBuffer).set(keyBytes);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBuffer,
  });

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription from browser');
  }

  await opts.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });

  return sub;
}

export async function disableWebPush(opts: {
  unsubscribe: (endpoint: string) => Promise<unknown>;
}): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await opts.unsubscribe(endpoint);
}

export async function getActivePushEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
