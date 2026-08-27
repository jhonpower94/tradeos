import { useEffect } from 'react';
import { candleChannelKey, candleWsChannel } from '../components/candleChartUtils';
import { subscribeChannel, unsubscribeChannel } from './wsChannels';
import { useLiveStore } from '../stores/liveStore';

export function useCandleStream(symbol: string, interval: string) {
  const key = candleChannelKey(symbol, interval);
  const patch = useLiveStore((s) => s.candlePatches[key]);

  useEffect(() => {
    if (!symbol || !interval) return;
    const channel = candleWsChannel(symbol, interval);
    subscribeChannel(channel);
    return () => unsubscribeChannel(channel);
  }, [symbol, interval]);

  return patch;
}
