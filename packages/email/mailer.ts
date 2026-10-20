import { env } from '@documenso/lib/utils/env';
import { ResendTransport } from '@documenso/nodemailer-resend';
import type { Transporter } from 'nodemailer';
import { createTransport } from 'nodemailer';

import { MailChannelsTransport } from './transports/mailchannels';
import { MsGraphTransport } from './transports/msgraph';

/**
 * Creates a Nodemailer transport object for sending emails.
 *
 * This function uses various environment variables to configure the appropriate
 * email transport mechanism. It supports multiple types of email transports,
 * including MailChannels, Resend, and different SMTP configurations.
 *
 * @returns {Transporter} A configured Nodemailer transporter instance.
 *
 * Supported Transports:
 * - **mailchannels**: Uses MailChannelsTransport, requiring:
 *   - `NEXT_PRIVATE_MAILCHANNELS_API_KEY`: API key for MailChannels
 *   - `NEXT_PRIVATE_MAILCHANNELS_ENDPOINT`: Endpoint for MailChannels (optional)
 * - **resend**: Uses ResendTransport, requiring:
 *   - `NEXT_PRIVATE_RESEND_API_KEY`: API key for Resend
 * - **msgraph**: Sends via Microsoft Graph over HTTPS (no SMTP port needed), requiring:
 *   - `NEXT_PRIVATE_OAUTH_CLIENT_ID`, `NEXT_PRIVATE_OAUTH_CLIENT_SECRET`, `NEXT_PRIVATE_OAUTH_TENANT_ID`
 *   - `NEXT_PRIVATE_OAUTH_REFRESH_TOKEN` (optional): delegated flow, sends as the token's user.
 *     If unset, app-only client credentials are used and mail is sent as the from address
 *     (requires the `Mail.Send` application permission).
 * - **smtp-api**: Uses a custom SMTP API configuration, requiring:
 *   - `NEXT_PRIVATE_SMTP_HOST`: The SMTP server host
 *   - `NEXT_PRIVATE_SMTP_APIKEY`: The API key for SMTP authentication
 *   - `NEXT_PRIVATE_SMTP_APIKEY_USER`: The username for SMTP authentication (default: 'apikey')
 * - **smtp-auth** (default): Uses a standard SMTP configuration, requiring:
 *   - `NEXT_PRIVATE_SMTP_HOST`: The SMTP server host (default: 'localhost:2500')
 *   - `NEXT_PRIVATE_SMTP_PORT`: The port to connect to (default: 587)
 *   - `NEXT_PRIVATE_SMTP_SECURE`: Whether to use SSL/TLS (default: false)
 *   - `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS`: Whether to ignore TLS (default: false)
 *   - `NEXT_PRIVATE_SMTP_USERNAME`: The username for SMTP authentication
 *   - `NEXT_PRIVATE_SMTP_PASSWORD`: The password for SMTP authentication
 *   - `NEXT_PRIVATE_SMTP_SERVICE`: The SMTP service provider (e.g., "gmail"). This option is used
 *     when integrating with well-known services (like Gmail), enabling simplified configuration.
 *   - When `NEXT_PRIVATE_SMTP_HOST` is `smtp.office365.com` and `NEXT_PRIVATE_OAUTH_CLIENT_ID`,
 *     `NEXT_PRIVATE_OAUTH_CLIENT_SECRET`, `NEXT_PRIVATE_OAUTH_TENANT_ID` and
 *     `NEXT_PRIVATE_OAUTH_REFRESH_TOKEN` are all set, OAuth2 is used instead of the password.
 *
 * Example Usage:
 * ```env
 * NEXT_PRIVATE_SMTP_TRANSPORT='smtp-auth';
 * NEXT_PRIVATE_SMTP_HOST='smtp.example.com';
 * NEXT_PRIVATE_SMTP_PORT=587;
 * NEXT_PRIVATE_SMTP_SERVICE='gmail';
 * NEXT_PRIVATE_SMTP_SECURE='true';
 * NEXT_PRIVATE_SMTP_USERNAME='your-email@gmail.com';
 * NEXT_PRIVATE_SMTP_PASSWORD='your-password';
 * ```
 *
 * Notes:
 * - Ensure that the required environment variables for each transport type are set.
 * - If `NEXT_PRIVATE_SMTP_TRANSPORT` is not specified, the default is `smtp-auth`.
 * - `NEXT_PRIVATE_SMTP_SERVICE` is optional and used specifically for well-known services like Gmail.
 */
const getTransport = (): Transporter => {
  const transport = env('NEXT_PRIVATE_SMTP_TRANSPORT') ?? 'smtp-auth';

  if (transport === 'mailchannels') {
    return createTransport(
      MailChannelsTransport.makeTransport({
        apiKey: env('NEXT_PRIVATE_MAILCHANNELS_API_KEY'),
        endpoint: env('NEXT_PRIVATE_MAILCHANNELS_ENDPOINT'),
      }),
    );
  }

  if (transport === 'resend') {
    if (!env('NEXT_PRIVATE_RESEND_API_KEY')) {
      throw new Error('Resend transport requires NEXT_PRIVATE_RESEND_API_KEY');
    }

    return createTransport(
      ResendTransport.makeTransport({
        apiKey: env('NEXT_PRIVATE_RESEND_API_KEY'),
      }),
    );
  }

  if (transport === 'msgraph') {
    const clientId = env('NEXT_PRIVATE_OAUTH_CLIENT_ID')?.trim();
    const clientSecret = env('NEXT_PRIVATE_OAUTH_CLIENT_SECRET')?.trim();
    const tenantId = env('NEXT_PRIVATE_OAUTH_TENANT_ID')?.trim();

    if (!clientId || !clientSecret || !tenantId) {
      throw new Error(
        'Microsoft Graph transport requires NEXT_PRIVATE_OAUTH_CLIENT_ID, NEXT_PRIVATE_OAUTH_CLIENT_SECRET and NEXT_PRIVATE_OAUTH_TENANT_ID',
      );
    }

    return createTransport(
      MsGraphTransport.makeTransport({
        clientId,
        clientSecret,
        tenantId,
        refreshToken: env('NEXT_PRIVATE_OAUTH_REFRESH_TOKEN')?.trim() || undefined,
      }),
    );
  }

  if (transport === 'smtp-api') {
    if (!env('NEXT_PRIVATE_SMTP_HOST') || !env('NEXT_PRIVATE_SMTP_APIKEY')) {
      throw new Error('SMTP API transport requires NEXT_PRIVATE_SMTP_HOST and NEXT_PRIVATE_SMTP_APIKEY');
    }

    return createTransport({
      host: env('NEXT_PRIVATE_SMTP_HOST'),
      port: Number(env('NEXT_PRIVATE_SMTP_PORT')) || 587,
      secure: env('NEXT_PRIVATE_SMTP_SECURE') === 'true',
      auth: {
        user: env('NEXT_PRIVATE_SMTP_APIKEY_USER') ?? 'apikey',
        pass: env('NEXT_PRIVATE_SMTP_APIKEY') ?? '',
      },
    });
  }

  const clientId = env('NEXT_PRIVATE_OAUTH_CLIENT_ID');
  const clientSecret = env('NEXT_PRIVATE_OAUTH_CLIENT_SECRET')?.trim();
  const tenantId = env('NEXT_PRIVATE_OAUTH_TENANT_ID')?.trim();
  const refreshToken = env('NEXT_PRIVATE_OAUTH_REFRESH_TOKEN')?.trim();
  const smtpUser = env('NEXT_PRIVATE_SMTP_USERNAME');

  if (
    env('NEXT_PRIVATE_SMTP_HOST') === 'smtp.office365.com' &&
    clientId &&
    clientSecret &&
    tenantId &&
    refreshToken &&
    smtpUser
  ) {
    console.log('Using Office 365 OAuth2 transport');
    return createTransport({
      host: 'smtp.office365.com',
      port: Number(env('NEXT_PRIVATE_SMTP_PORT')) || 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: smtpUser,
        clientId,
        clientSecret,
        refreshToken,
        accessUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      },
    });
  }

  return createTransport({
    host: env('NEXT_PRIVATE_SMTP_HOST') ?? '127.0.0.1:2500',
    port: Number(env('NEXT_PRIVATE_SMTP_PORT')) || 587,
    secure: env('NEXT_PRIVATE_SMTP_SECURE') === 'true',
    ignoreTLS: env('NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS') === 'true',
    auth: env('NEXT_PRIVATE_SMTP_USERNAME')
      ? {
          user: env('NEXT_PRIVATE_SMTP_USERNAME'),
          pass: env('NEXT_PRIVATE_SMTP_PASSWORD') ?? '',
        }
      : undefined,
    ...(env('NEXT_PRIVATE_SMTP_SERVICE') ? { service: env('NEXT_PRIVATE_SMTP_SERVICE') } : {}),
  });
};

export const mailer = getTransport();
