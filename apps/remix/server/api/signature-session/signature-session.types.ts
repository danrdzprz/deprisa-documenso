import { isBase64Image } from '@documenso/lib/constants/signatures';
import { z } from 'zod';

// ~1.5MB of base64, signatures are small PNGs.
export const SIGNATURE_SESSION_MAX_LENGTH = 1_500_000;

export const ZSignatureSessionSubmitRequestParamsSchema = z.object({
  token: z.string().min(1).max(100),
});

export const ZSignatureSessionSubmitRequestSchema = z.object({
  signature: z
    .string()
    .max(SIGNATURE_SESSION_MAX_LENGTH)
    .refine((value) => isBase64Image(value), { message: 'Signature must be a base64 PNG image' }),
});

export const ZSignatureSessionPollRequestParamsSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

export type TSignatureSessionCreateResponse = {
  sessionId: string;
  token: string;
};

export type TSignatureSessionPollResponse = {
  status: 'pending' | 'completed';
  signature?: string;
};
