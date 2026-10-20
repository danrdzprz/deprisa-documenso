import { formatPath } from '@documenso/lib/constants/app';

import { Trans } from '@lingui/react/macro';
import { Loader, RotateCcwIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

import { cn } from '../../lib/utils';
import { SignatureRender } from './signature-render';

const POLL_INTERVAL_MS = 2000;

export type SignaturePadMobileProps = {
  className?: string;
  value: string;
  onChange: (_signatureDataUrl: string) => void;
};

export const SignaturePadMobile = ({ className, value, onChange }: SignaturePadMobileProps) => {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const hasValue = value !== '';

  useEffect(() => {
    if (hasValue) {
      return;
    }

    let isCancelled = false;
    let isCompleted = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let socket: Socket | undefined;

    const complete = (signature: string) => {
      if (isCancelled || isCompleted) {
        return;
      }

      isCompleted = true;
      onChange(signature);
    };

    const listen = (sessionId: string) => {
      socket = io({
        path: formatPath('/api/signature-session/socket'),
        auth: { sessionId },
        reconnection: false,
      });

      socket.on('signature', (signature: string) => {
        complete(signature);
      });

      // Fall back to polling when the socket is unavailable or drops.
      let isPolling = false;

      const fallbackToPolling = () => {
        if (isCancelled || isCompleted || isPolling) {
          return;
        }

        isPolling = true;
        void poll(sessionId);
      };

      socket.on('connect_error', fallbackToPolling);
      socket.on('disconnect', fallbackToPolling);
    };

    const poll = async (sessionId: string) => {
      if (isCancelled) {
        return;
      }

      try {
        const response = await fetch(formatPath(`/api/signature-session/${sessionId}`));

        if (isCancelled) {
          return;
        }

        // The session expired, start a new one so the QR code stays valid.
        if (response.status === 404) {
          void start();
          return;
        }

        const data: { status: 'pending' | 'completed'; signature?: string } = await response.json();

        if (data.status === 'completed' && data.signature) {
          complete(data.signature);
          return;
        }
      } catch {
        // Ignore transient network errors and keep polling.
      }

      timeout = setTimeout(() => void poll(sessionId), POLL_INTERVAL_MS);
    };

    const start = async () => {
      try {
        const response = await fetch(formatPath('/api/signature-session'), { method: 'POST' });

        if (!response.ok) {
          throw new Error('Failed to create signature session');
        }

        const { sessionId, token }: { sessionId: string; token: string } = await response.json();

        if (isCancelled) {
          return;
        }

        setHasError(false);
        setSignatureUrl(`${window.location.origin}${formatPath(`/signature-session/${token}`)}`);

        listen(sessionId);
      } catch {
        if (!isCancelled) {
          setHasError(true);
        }
      }
    };

    void start();

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
      socket?.disconnect();
    };
  }, [hasValue]);

  const onRedrawClick = () => {
    setSignatureUrl(null);
    onChange('');
  };

  return (
    <div className={cn('flex h-full w-full items-center justify-center', className)}>
      {hasValue && (
        <>
          <SignatureRender className="h-full w-full" value={value} />

          <button
            type="button"
            className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full p-0 text-[0.688rem] text-muted-foreground/60 ring-offset-background hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onRedrawClick}
          >
            <RotateCcwIcon className="h-3 w-3" />
            <Trans>Redraw on mobile</Trans>
          </button>
        </>
      )}

      {!hasValue && signatureUrl && (
        <div className="flex flex-col items-center gap-2 p-2">
          <div className="rounded-md bg-white p-2">
            <QRCodeSVG data-testid="signature-pad-mobile-qr" value={signatureUrl} size={112} />
          </div>

          <p className="max-w-[28ch] text-muted-foreground text-xs">
            <Trans>Scan the QR code with your phone or tablet to draw your signature</Trans>
          </p>
        </div>
      )}

      {!hasValue && !signatureUrl && !hasError && <Loader className="h-5 w-5 animate-spin text-muted-foreground" />}

      {!hasValue && hasError && (
        <p className="text-destructive text-xs">
          <Trans>Unable to generate the QR code, please try again</Trans>
        </p>
      )}
    </div>
  );
};
