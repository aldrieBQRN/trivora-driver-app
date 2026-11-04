import { getApiBaseUrl, getAuthToken } from './api';

// Public Reverb app key of the production server, same as the Passenger App. Not a secret: every
// client needs it to connect; REVERB_APP_SECRET stays on the server.
const DEFAULT_REVERB_KEY = 'b755b55cbf3a39a2226378300ed029a1';

const KEEP_ALIVE_MS = 30000;
// Reverb answers a ping at once, so this much silence means the connection is gone.
const SILENCE_LIMIT_MS = 70000;
const MAX_RECONNECT_DELAY_MS = 30000;

/** The event's name, or null right after (re)subscribing: events sent before that are gone. */
export type RealtimeListener = (event: string | null) => void;

export interface RealtimeChannel {
  /** True only while the socket is open and the channel is subscribed. */
  isLive: () => boolean;
  stop: () => void;
}

function socketUrl(): string {
  const key = process.env.EXPO_PUBLIC_REVERB_KEY || DEFAULT_REVERB_KEY;
  const api = getApiBaseUrl();
  const host = api.match(/^https?:\/\/([^/:]+)/i)?.[1] ?? '127.0.0.1';
  // Production reaches Reverb through nginx on 443; local dev talks to reverb:start on 8080.
  const origin = api.startsWith('https://') ? `wss://${host}` : `ws://${host}:8080`;
  return `${origin}/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`;
}

async function authorize(channelName: string, socketId: string): Promise<string> {
  const token = getAuthToken();
  const res = await fetch(`${getApiBaseUrl()}/broadcasting/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ socket_id: socketId, channel_name: channelName }),
  });
  if (!res.ok) throw new Error(`Broadcast auth HTTP ${res.status}`);
  return (await res.json()).auth;
}

/**
 * One socket on one private channel, over React Native's built-in WebSocket. pusher-js needs the
 * NetInfo native module, which the installed APK doesn't have, so this speaks the few Pusher
 * protocol messages it needs itself and can ship by OTA.
 */
function openChannel(channel: string, onEvent: RealtimeListener): RealtimeChannel {
  const channelName = `private-${channel}`;
  let socket: WebSocket | null = null;
  let live = false;
  let stopped = false;
  let attempts = 0;
  let lastMessageAt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const keepAlive = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastMessageAt > SILENCE_LIMIT_MS) {
      socket.close();
      return;
    }
    socket.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
  }, KEEP_ALIVE_MS);

  const connect = () => {
    const ws = new WebSocket(socketUrl());
    socket = ws;
    lastMessageAt = Date.now();

    ws.onmessage = async ({ data }) => {
      lastMessageAt = Date.now();
      try {
        const message = JSON.parse(data);

        if (message.event === 'pusher:connection_established') {
          const { socket_id: socketId } = JSON.parse(message.data);
          const auth = await authorize(channelName, socketId);
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: channelName, auth } }));
        } else if (message.event === 'pusher:ping') {
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        } else if (message.event === 'pusher_internal:subscription_succeeded') {
          live = true;
          attempts = 0;
          onEvent(null);
        } else if (message.channel === channelName) {
          onEvent(message.event);
        }
      } catch {
        ws.close();
      }
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      if (socket !== ws) return;
      live = false;
      socket = null;
      if (stopped) return;
      attempts += 1;
      reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts, MAX_RECONNECT_DELAY_MS));
    };
  };

  connect();

  return {
    isLive: () => live,
    stop: () => {
      stopped = true;
      live = false;
      clearInterval(keepAlive);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}

const openChannels = new Map<string, { connection: RealtimeChannel; listeners: Set<RealtimeListener> }>();

/**
 * Listens on a private Reverb channel. Everyone on the same channel shares one socket, closed when
 * the last of them stops. Callers must keep their own check running: a dropped socket only shows
 * as isLive() returning false until the next reconnect.
 */
export function listenOnPrivateChannel(channel: string, listener: RealtimeListener): RealtimeChannel {
  let open = openChannels.get(channel);
  if (!open) {
    const listeners = new Set<RealtimeListener>();
    open = {
      listeners,
      connection: openChannel(channel, (event) => listeners.forEach((notify) => notify(event))),
    };
    openChannels.set(channel, open);
  }

  const { connection, listeners } = open;
  listeners.add(listener);

  return {
    isLive: connection.isLive,
    stop: () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        connection.stop();
        openChannels.delete(channel);
      }
    },
  };
}
