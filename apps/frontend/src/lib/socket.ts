import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (socket) {
    return socket;
  }

  // An empty WS_URL means "same origin" (used when accessed through the Caddy
  // HTTPS proxy, which routes /socket.io to the backend).
  socket = WS_URL
    ? io(WS_URL, { auth: { token }, autoConnect: true })
    : io({ auth: { token }, autoConnect: true });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
