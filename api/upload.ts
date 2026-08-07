import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getBearerUser } from './_lib/auth.js';
import { handleCors } from './_lib/cors.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/**
 * Signs client-side uploads to Vercel Blob.
 *
 * The browser sends bytes straight to Blob storage; this function only
 * authorises the transfer. The previous design base64-encoded the file into a
 * JSON request body, which capped uploads at roughly 3.3MB: Vercel rejects
 * function payloads above ~4.5MB, and base64 inflates a file by a third. Every
 * photo above that failed with an opaque 413 before any of this code ran, so
 * the friendly size message could never fire — and a normal camera JPEG could
 * not be uploaded at all.
 *
 * Going direct also means no size ceiling worth worrying about, real progress
 * events, and no multi-megabyte string sitting in function memory.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return res.status(503).json({
      error: 'Upload storage is not configured',
      hint: 'Set BLOB_READ_WRITE_TOKEN on the project (all environments). See .env.example.',
    });
  }

  try {
    const body = req.body as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // The upload helper posts here directly, so the session token travels in
        // clientPayload rather than an Authorization header.
        const user = getBearerUser(`Bearer ${clientPayload ?? ''}`);
        if (!user) {
          throw new Error('Unauthorized');
        }

        return {
          allowedContentTypes: ALLOWED_TYPES,
          // Namespaced per user, and suffixed so re-uploading the same filename
          // never overwrites an existing photo.
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.userId, pathname }),
        };
      },

      onUploadCompleted: async () => {
        // Vercel calls this from its own servers once the transfer lands. The
        // client already receives the URL, and the photo row is created by the
        // caller, so there is nothing to do here — but the callback must exist.
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Upload failed';
    if (message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(400).json({ error: message });
  }
}
