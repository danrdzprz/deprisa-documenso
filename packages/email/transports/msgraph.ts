import type { SentMessageInfo, Transport } from 'nodemailer';
import type { Address } from 'nodemailer/lib/mailer';
import type MailMessage from 'nodemailer/lib/mailer/mail-message';

import { normalizeMailHeaders } from './normalize-headers';

const VERSION = '1.0.0';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

type NodeMailerAddress = string | Address | Array<string | Address> | undefined;

type GraphRecipient = {
  emailAddress: { address: string; name?: string };
};

type GraphTransportOptions = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  /**
   * When provided, the delegated refresh token flow is used and mail is sent as the
   * authenticated user (`/me/sendMail`). Otherwise the app-only client credentials flow
   * is used and mail is sent as the `from` address (`/users/{from}/sendMail`).
   */
  refreshToken?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

/**
 * Transport for sending email through the Microsoft Graph API over HTTPS, for hosts
 * where outbound SMTP ports are blocked.
 *
 * Required permission: `Mail.Send` (Application for client credentials, Delegated for refresh token).
 *
 * @see https://learn.microsoft.com/en-us/graph/api/user-sendmail
 */
export class MsGraphTransport implements Transport<SentMessageInfo> {
  public name = 'MicrosoftGraphTransport';
  public version = VERSION;

  private _options: GraphTransportOptions;
  private _token: CachedToken | null = null;

  public static makeTransport(options: GraphTransportOptions) {
    return new MsGraphTransport(options);
  }

  constructor(options: GraphTransportOptions) {
    this._options = options;
  }

  public send(mail: MailMessage, callback: (_err: Error | null, _info: SentMessageInfo) => void) {
    this.sendMail(mail)
      .then((info) => callback(null, info))
      .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), null));
  }

  private async sendMail(mail: MailMessage): Promise<SentMessageInfo> {
    if (!mail.data.to || !mail.data.from) {
      throw new Error('Missing required fields "to" or "from"');
    }

    const to = this.toGraphRecipients(mail.data.to);
    const cc = this.toGraphRecipients(mail.data.cc);
    const bcc = this.toGraphRecipients(mail.data.bcc);
    const [from] = this.toGraphRecipients(mail.data.from);
    const replyTo = this.toGraphRecipients(mail.data.replyTo);

    if (!from) {
      throw new Error('Missing required field "from"');
    }

    const isHtml = Boolean(mail.data.html);
    const content = (isHtml ? mail.data.html : mail.data.text)?.toString('utf-8') ?? '';

    const attachments = (mail.data.attachments ?? []).map((attachment) => {
      if (attachment.content === undefined || attachment.content === null) {
        throw new Error('Microsoft Graph transport only supports attachments with inline "content"');
      }

      const buffer = Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(attachment.content.toString(), (attachment.encoding as BufferEncoding) ?? 'utf-8');

      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.filename ?? 'attachment',
        contentType: attachment.contentType ?? 'application/octet-stream',
        contentBytes: buffer.toString('base64'),
        ...(attachment.cid ? { isInline: true, contentId: attachment.cid } : {}),
      };
    });

    // Graph only accepts custom headers prefixed with "x-".
    const headers = Object.entries(normalizeMailHeaders(mail.data.headers) ?? {})
      .filter(([name]) => name.toLowerCase().startsWith('x-'))
      .map(([name, value]) => ({ name, value }));

    const message = {
      subject: mail.data.subject ?? '',
      body: { contentType: isHtml ? 'HTML' : 'Text', content },
      from,
      toRecipients: to,
      ccRecipients: cc,
      bccRecipients: bcc,
      replyTo,
      attachments,
      ...(headers.length > 0 ? { internetMessageHeaders: headers } : {}),
    };

    const accessToken = await this.getAccessToken();

    const sendPath = this._options.refreshToken
      ? '/me/sendMail'
      : `/users/${encodeURIComponent(from.emailAddress.address)}/sendMail`;

    const res = await fetch(`${GRAPH_BASE_URL}${sendPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);

      throw new Error(`Microsoft Graph error (${res.status}): ${data?.error?.message ?? res.statusText}`);
    }

    return {
      messageId: '',
      envelope: { from: from.emailAddress.address, to: to.map((r) => r.emailAddress.address) },
      accepted: to.map((r) => r.emailAddress.address),
      rejected: [],
      pending: [],
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this._token && this._token.expiresAt > Date.now() + 60_000) {
      return this._token.accessToken;
    }

    const { clientId, clientSecret, tenantId, refreshToken } = this._options;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...(refreshToken
        ? {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: 'https://graph.microsoft.com/Mail.Send offline_access',
          }
        : {
            grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default',
          }),
    });

    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.access_token) {
      throw new Error(`Microsoft Graph token error: ${data?.error_description ?? data?.error ?? res.statusText}`);
    }

    this._token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    };

    return this._token.accessToken;
  }

  /**
   * Converts nodemailer address(es) to Graph recipients. Handles "Name <email>" strings.
   */
  private toGraphRecipients(address: NodeMailerAddress): GraphRecipient[] {
    if (!address) {
      return [];
    }

    const list = Array.isArray(address) ? address : [address];

    return list.map((item) => {
      if (typeof item !== 'string') {
        return { emailAddress: { address: item.address, name: item.name || undefined } };
      }

      const match = item.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);

      if (match) {
        return { emailAddress: { address: match[2].trim(), name: match[1].trim() || undefined } };
      }

      return { emailAddress: { address: item.trim() } };
    });
  }
}
