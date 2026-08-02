import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

interface Client {
  userId: string;
  socket: WebSocket;
  channels: Set<string>;
}

const clients = new Map<WebSocket, Client>();

export function gatewayBroadcast(userId: string, channel: string, data: unknown) {
  const payload = JSON.stringify({ channel, data, ts: Date.now() });
  for (const client of clients.values()) {
    if (client.userId === userId && (client.channels.has(channel) || client.channels.has('*'))) {
      if (client.socket.readyState === 1) client.socket.send(payload);
    }
  }
}

export async function registerGateway(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    let userId: string | null = null;
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        const decoded = app.jwt.verify<{ sub: string }>(token);
        userId = decoded.sub;
      }
    } catch {
      socket.close();
      return;
    }
    if (!userId) {
      socket.close();
      return;
    }

    const client: Client = {
      userId,
      socket: socket as unknown as WebSocket,
      channels: new Set(['opportunities', 'positions', 'trades', 'notifications', 'scanner.status']),
    };
    clients.set(socket as unknown as WebSocket, client);

    const heartbeat = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ channel: 'ping', ts: Date.now() }));
    }, 30_000);

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          action?: string;
          channel?: string;
        };
        if (msg.action === 'subscribe' && msg.channel) client.channels.add(msg.channel);
        if (msg.action === 'unsubscribe' && msg.channel) client.channels.delete(msg.channel);
      } catch {
        // ignore
      }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(socket as unknown as WebSocket);
    });
  });
}
