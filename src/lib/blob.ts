import { put } from '@vercel/blob';

// Vercel's server-side `put()` (routing the file through this server rather
// than uploading directly from the browser) tops out at 4.5 MB per request.
const MAX_SCREENSHOT_BYTES = 4.5 * 1024 * 1024;

export class ScreenshotTooLargeError extends Error {
  constructor() {
    super('That screenshot is too large (max 4.5 MB) - try cropping it or using a lower-resolution capture.');
    this.name = 'ScreenshotTooLargeError';
  }
}

function guessExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

/** Uploads a score's "proof" screenshot to Vercel Blob and returns its public URL. */
export async function uploadScoreScreenshot(
  file: File,
  opts: { playDate: string; game: string; userId: string },
): Promise<string> {
  if (file.size > MAX_SCREENSHOT_BYTES) {
    throw new ScreenshotTooLargeError();
  }

  const pathname = `scores/${opts.playDate}/${opts.game}/${opts.userId}-${Date.now()}${guessExtension(file.type)}`;
  const blob = await put(pathname, file, {
    access: 'public',
    contentType: file.type || 'application/octet-stream',
  });
  return blob.url;
}
