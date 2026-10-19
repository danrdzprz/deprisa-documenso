import type { Server as HttpServer } from 'node:http';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { env } from '@documenso/lib/utils/env';
import { Server } from 'socket.io';

import { subscribeToSignatureSession } from './signature-session.store';

const basePath = (env('NEXT_PUBLIC_BASE_PATH') ?? '').replace(/\/$/, '');

export const SIGNATURE_SESSION_SOCKET_PATH = `${basePath}/api/signature-session/socket`;

/**
 * Attach the socket.io server that pushes drawn signatures to the waiting desktop.
 */
export const attachSignatureSessionSocket = (httpServer: HttpServer) => {
  const validOrigin = new URL(NEXT_PUBLIC_WEBAPP_URL()).origin;

  const io = new Server(httpServer, {
    path: SIGNATURE_SESSION_SOCKET_PATH,
    maxHttpBufferSize: 1024,
    // Browsers do not apply CORS to websockets, so the origin must be checked manually.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;

      callback(null, origin === undefined || origin === validOrigin);
    },
  });

  io.on('connection', (socket) => {
    const sessionId = socket.handshake.auth?.sessionId;

    const unsubscribe =
      typeof sessionId === 'string'
        ? subscribeToSignatureSession(sessionId, (signature) => {
            socket.emit('signature', signature);
          })
        : null;

    if (!unsubscribe) {
      socket.disconnect(true);
      return;
    }

    socket.on('disconnect', unsubscribe);
  });

  return io;
};
