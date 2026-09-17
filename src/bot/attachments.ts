import type { Attachment } from 'botbuilder';
import { MicrosoftAppCredentials } from 'botframework-connector';
import { config } from '../config';
import { toSupportedImageMediaType } from '../vision/scoreVisionParser';

export interface DownloadedImage {
  base64: string;
  mediaType: string;
}

/** Returns only the attachments that look like an inline image. */
export function extractImageAttachments(attachments: Attachment[] | undefined): Attachment[] {
  if (!attachments) return [];
  return attachments.filter((a) => (a.contentType || '').toLowerCase().startsWith('image/'));
}

/**
 * Downloads a Teams message attachment's bytes.
 *
 * Two shapes show up in practice:
 *  - Files shared via a file-consent card carry a pre-signed `content.downloadUrl`
 *    that needs no extra auth - and must NOT get a bearer token, since that can
 *    make the pre-signed URL's own query auth get rejected.
 *  - Images pasted directly into the compose box carry only `contentUrl`,
 *    pointing at the Bot Connector's authenticated attachment endpoint, which
 *    needs the bot's own app token as a bearer credential.
 *
 * If your deployment's screenshots consistently fail to download, this is the
 * integration point to check first - see "Screenshot download failing" in
 * docs/DEPLOYMENT.md.
 */
export async function downloadAttachment(attachment: Attachment): Promise<DownloadedImage> {
  const preAuthedUrl: string | undefined = (attachment.content as { downloadUrl?: string } | undefined)
    ?.downloadUrl;
  const url = preAuthedUrl || attachment.contentUrl;
  if (!url) {
    throw new Error('This attachment has no downloadable URL.');
  }

  const headers: Record<string, string> = {};
  if (!preAuthedUrl && config.bot.appId && config.bot.appPassword) {
    try {
      const credentials = new MicrosoftAppCredentials(config.bot.appId, config.bot.appPassword);
      const token = await credentials.getToken();
      headers.Authorization = `Bearer ${token}`;
    } catch {
      // Fall through and try without a token - some deployments (e.g. the
      // Bot Framework Emulator) serve attachments without requiring one.
    }
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `Could not download that attachment (HTTP ${response.status}). Please try re-sending it.`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    base64: buffer.toString('base64'),
    mediaType: toSupportedImageMediaType(attachment.contentType),
  };
}
