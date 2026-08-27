import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useLiveStore, type CandlePatch } from '../stores/liveStore';
import { candleChannelKey } from '../components/candleChartUtils';
import { replayChannelSubscriptions, setWsSend } from './wsChannels';

const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const setConnectionStatus = useLiveStore((s) => s.setConnectionStatus);
  const setOpportunities = useLiveStore((s) => s.setOpportunities);
  const setPositions = useLiveStore((s) => s.setPositions);
  const applyCandlePatch = useLiveStore((s) => s.applyCandlePatch);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setConnectionStatus('disconnected');
      setWsSend(null);
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
        setWsSend((msg) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg));
          }
        });
        replayChannelSubscriptions();
      };

      socket.onmessage = (ev) => {
        if (!alive) return;
        try {
          const msg = JSON.parse(ev.data) as { channel: string; data: unknown };
          if (msg.channel === 'opportunities' && Array.isArray(msg.data)) {
            setOpportunities(msg.data);
            void queryClient.invalidateQueries({ queryKey: ['signals'] });
            void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
          }
          if (msg.channel === 'positions' && Array.isArray(msg.data)) setPositions(msg.data);
          if (msg.channel.startsWith('candles:') && msg.data && typeof msg.data === 'object') {
            const payload = msg.data as {
              symbol?: string;
              interval?: string;
              candle?: CandlePatch['candle'];
              isClosed?: boolean;
            };
            if (payload.symbol && payload.interval && payload.candle) {
              applyCandlePatch(candleChannelKey(payload.symbol, payload.interval), {
                symbol: payload.symbol.toUpperCase(),
                interval: payload.interval,
                candle: payload.candle,
                isClosed: Boolean(payload.isClosed),
                ts: Date.now(),
              });
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        // onclose handles status / reconnect; avoid double-setting on intentional teardown
      };

      socket.onclose = () => {
        setWsSend(null);
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
      setWsSend(null);
      const socket = ws;
      ws = null;
      if (!socket) return;
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
  }, [token, queryClient, setConnectionStatus, setOpportunities, setPositions, applyCandlePatch]);
}
