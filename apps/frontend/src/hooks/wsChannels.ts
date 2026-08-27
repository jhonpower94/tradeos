type WsSend = (msg: object) => void;

const activeChannels = new Set<string>();
let sendFn: WsSend | null = null;

export function setWsSend(fn: WsSend | null) {
  sendFn = fn;
}

export function replayChannelSubscriptions() {
  if (!sendFn) return;
  for (const channel of activeChannels) {
    sendFn({ action: 'subscribe', channel });
  }
}

export function subscribeChannel(channel: string) {
  activeChannels.add(channel);
  sendFn?.({ action: 'subscribe', channel });
}

export function unsubscribeChannel(channel: string) {
  activeChannels.delete(channel);
  sendFn?.({ action: 'unsubscribe', channel });
}

/** Test helper */
export function resetWsChannels() {
  activeChannels.clear();
  sendFn = null;
}

export function getActiveChannels(): string[] {
  return [...activeChannels];
}
