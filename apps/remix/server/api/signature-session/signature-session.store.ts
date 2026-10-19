import { nanoid } from 'nanoid';

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 10_000;

type SignatureSession = {
  token: string;
  signature: string | null;
  expiresAt: number;
};

type SignatureListener = (signature: string) => void;

// In-memory relay, sessions are short lived and only valid on the instance that created them.
const sessionsById = new Map<string, SignatureSession>();
const sessionIdsByToken = new Map<string, string>();
const listenersBySessionId = new Map<string, Set<SignatureListener>>();

const removeSession = (sessionId: string) => {
  const session = sessionsById.get(sessionId);

  if (session) {
    sessionIdsByToken.delete(session.token);
  }

  sessionsById.delete(sessionId);
  listenersBySessionId.delete(sessionId);
};

const removeExpiredSessions = () => {
  const now = Date.now();

  for (const [sessionId, session] of sessionsById) {
    if (session.expiresAt <= now) {
      removeSession(sessionId);
    }
  }
};

const getActiveSession = (sessionId: string) => {
  const session = sessionsById.get(sessionId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    removeSession(sessionId);

    return null;
  }

  return session;
};

export const createSignatureSession = () => {
  removeExpiredSessions();

  if (sessionsById.size >= MAX_ACTIVE_SESSIONS) {
    return null;
  }

  const sessionId = nanoid(32);
  const token = nanoid(32);

  sessionsById.set(sessionId, {
    token,
    signature: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  sessionIdsByToken.set(token, sessionId);

  return { sessionId, token };
};

export const getSignatureSessionSignature = (sessionId: string) => {
  const session = getActiveSession(sessionId);

  if (!session) {
    return null;
  }

  return { signature: session.signature };
};

/**
 * Store the signature submitted from the touch device and push it to any connected desktop.
 */
export const submitSignatureSession = (token: string, signature: string) => {
  const sessionId = sessionIdsByToken.get(token);

  if (!sessionId) {
    return false;
  }

  const session = getActiveSession(sessionId);

  if (!session) {
    return false;
  }

  session.signature = signature;

  listenersBySessionId.get(sessionId)?.forEach((listener) => listener(signature));

  return true;
};

/**
 * Subscribe to the signature for a session, returns null if the session does not exist.
 */
export const subscribeToSignatureSession = (sessionId: string, listener: SignatureListener) => {
  const session = getActiveSession(sessionId);

  if (!session) {
    return null;
  }

  if (session.signature) {
    listener(session.signature);
  }

  const listeners = listenersBySessionId.get(sessionId) ?? new Set<SignatureListener>();

  listeners.add(listener);
  listenersBySessionId.set(sessionId, listeners);

  return () => {
    listeners.delete(listener);
  };
};
