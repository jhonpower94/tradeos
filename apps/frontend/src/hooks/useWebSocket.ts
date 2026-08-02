import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useLiveStore } from '../stores/liveStore';

const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const setConnectionStatus = useLiveStore((s) => s.setConnectionStatus);
  const setOpportunities = useLiveStore((s) => s.setOpportunities);
  const setPositions = useLiveStore((s) => s.setPositions);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setConnectionStatus('disconnected');
      return;
    }

    let alive = true;
    let intentionalClose = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const clearReconnect = () => {
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };

    const connect = () => {
      if (!alive) return;
      clearReconnect();
      setConnectionStatus('connecting');

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) {
        setConnectionStatus('disconnected');
        return;
      }

      const socket = new WebSocket(
        `${proto}://${window.location.host}/ws?token=${encodeURIComponent(currentToken)}`,
      );
      ws = socket;

      socket.onopen = () => {
        if (!alive || intentionalClose) return;
        attemptRef.current = 0;
        setConnectionStatus('connected');
      };

      socket.onmessage = (ev) => {
        if (!alive) return;
        try {
          const msg = JSON.parse(ev.data) as { channel: string; data: unknown };
          if (msg.channel === 'opportunities' && Array.isArray(msg.data)) setOpportunities(msg.data);
          if (msg.channel === 'positions' && Array.isArray(msg.data)) setPositions(msg.data);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        // onclose handles status / reconnect; avoid double-setting on intentional teardown
      };

      socket.onclose = () => {
        if (!alive || intentionalClose) return;
        setConnectionStatus('disconnected');
        if (!useAuthStore.getState().token) return;

        const attempt = attemptRef.current++;
        const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
        reconnectTimer = setTimeout(() => {
          if (alive && !intentionalClose) connect();
        }, delay);
      };
    };

    connect();

    return () => {
      alive = false;
      intentionalClose = true;
      clearReconnect();
      const socket = ws;
      ws = null;
      if (!socket) return;
      // Avoid close() while CONNECTING — browsers log a noisy warning.
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          try {
            socket.close();
          } catch {
            // ignore
          }
        };
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    };
  }, [token, setConnectionStatus, setOpportunities, setPositions]);
}
