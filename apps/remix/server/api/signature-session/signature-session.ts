import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import type { HonoEnv } from '../../router';
import {
  createSignatureSession,
  getSignatureSessionSignature,
  submitSignatureSession,
} from './signature-session.store';
import {
  type TSignatureSessionCreateResponse,
  type TSignatureSessionPollResponse,
  ZSignatureSessionPollRequestParamsSchema,
  ZSignatureSessionSubmitRequestParamsSchema,
  ZSignatureSessionSubmitRequestSchema,
} from './signature-session.types';

export const signatureSessionRoute = new Hono<HonoEnv>()
  /**
   * Create a session the desktop client listens on, and a token the touch device submits with.
   */
  .post('/', (c) => {
    const session = createSignatureSession();

    if (!session) {
      return c.json({ message: 'Too many active sessions', statusCode: 429 }, 429);
    }

    return c.json<TSignatureSessionCreateResponse>(session);
  })
  /**
   * Polling fallback for when the websocket is unavailable.
   */
  .get('/:sessionId', sValidator('param', ZSignatureSessionPollRequestParamsSchema), (c) => {
    const { sessionId } = c.req.valid('param');

    const result = getSignatureSessionSignature(sessionId);

    if (!result) {
      return c.json({ message: 'Session not found', statusCode: 404 }, 404);
    }

    if (!result.signature) {
      return c.json<TSignatureSessionPollResponse>({ status: 'pending' });
    }

    return c.json<TSignatureSessionPollResponse>({ status: 'completed', signature: result.signature });
  })
  /**
   * Webhook called by the touch device with the drawn signature, pushed to the desktop over the websocket.
   */
  .post(
    '/:token/submit',
    sValidator('param', ZSignatureSessionSubmitRequestParamsSchema),
    sValidator('json', ZSignatureSessionSubmitRequestSchema),
    (c) => {
      const { token } = c.req.valid('param');
      const { signature } = c.req.valid('json');

      if (!submitSignatureSession(token, signature)) {
        return c.json({ message: 'Session not found', statusCode: 404 }, 404);
      }

      return c.json({ success: true });
    },
  );
