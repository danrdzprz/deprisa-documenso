import { formatPath } from '@documenso/lib/constants/app';
import { Button } from '@documenso/ui/primitives/button';
import { SignaturePadDraw } from '@documenso/ui/primitives/signature-pad/signature-pad-draw';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { CheckCircle2Icon } from 'lucide-react';
import { useState } from 'react';

import type { Route } from './+types/signature-session.$token';

export default function SignatureSessionPage({ params }: Route.ComponentProps) {
  const { token } = params;

  const { t } = useLingui();
  const { toast } = useToast();

  const [signature, setSignature] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch(formatPath(`/api/signature-session/${token}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit signature');
      }

      setIsSubmitted(true);
    } catch {
      toast({
        title: t`Something went wrong`,
        description: t`We were unable to send your signature. The session may have expired, please scan the QR code again.`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="flex items-center gap-2">
          <CheckCircle2Icon className="h-7 w-7 text-green-500" />

          <h1 className="font-semibold text-2xl">
            <Trans>Signature sent</Trans>
          </h1>
        </div>

        <p className="mt-4 max-w-[40ch] text-muted-foreground leading-normal">
          <Trans>Go back to your desktop device to finish signing.</Trans>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4">
      <h1 className="text-center font-semibold text-2xl md:text-3xl">
        <Trans>Draw signature</Trans>
      </h1>

      <div className="relative mt-6 aspect-signature-pad w-full select-none rounded-lg border bg-background">
        <SignaturePadDraw className="h-full w-full" value={signature} onChange={setSignature} />
      </div>

      <Button
        type="button"
        className="mt-4 w-full"
        size="lg"
        disabled={!signature}
        loading={isSubmitting}
        onClick={() => void onSubmit()}
      >
        <Trans>Send</Trans>
      </Button>
    </div>
  );
}
