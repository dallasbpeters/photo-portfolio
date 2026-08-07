import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from '../_lib/db.js';
import { getBearerUser } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';
import { parseJsonBody } from '../_lib/parseBody.js';
import { sanitizeText } from '../_lib/httpUrl.js';
import {
  isEditorDoc,
  isPageStatus,
  normalizeSlug,
  rowToDto,
  rowToSummary,
  type PageRow,
} from '../_lib/pages.js';

const EMPTY_DOC = { type: 'doc', content: [] };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  try {
    const sql = getSql();
    const user = getBearerUser(req.headers.authorization);

    if (req.method === 'GET') {
      // Signed-in admins see drafts so they can manage them; the public sees
      // only what has been published.
      if (user) {
        const rows = (await sql`
          SELECT id, slug, title, icon, content, status, sort_order, created_at, updated_at
          FROM pages
          ORDER BY sort_order ASC, title ASC
        `) as PageRow[];
        return res.status(200).json(rows.map(rowToDto));
      }

      const rows = (await sql`
        SELECT id, slug, title, icon, content, status, sort_order, created_at, updated_at
        FROM pages
        WHERE status = 'published'
        ORDER BY sort_order ASC, title ASC
      `) as PageRow[];
      // Public callers get summaries only — the nav does not need every body.
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
      return res.status(200).json(rows.map(rowToSummary));
    }

    if (req.method === 'POST') {
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const body = parseJsonBody(req.body);
      const title = typeof body.title === 'string' ? sanitizeText(body.title).slice(0, 120) : '';
      if (!title) return res.status(400).json({ error: 'A page title is required.' });

      const slugCheck = normalizeSlug(body.slug);
      if (!slugCheck.ok) return res.status(400).json({ error: slugCheck.error });

      const icon = typeof body.icon === 'string' ? sanitizeText(body.icon).slice(0, 40) : null;
      const status = isPageStatus(body.status) ? body.status : 'draft';
      const content = isEditorDoc(body.content) ? body.content : EMPTY_DOC;

      const existing = await sql`SELECT id FROM pages WHERE slug = ${slugCheck.slug} LIMIT 1`;
      if (existing.length > 0) {
        return res.status(409).json({ error: `A page already uses "${slugCheck.slug}".` });
      }

      // New pages go to the end of the nav rather than the front, so creating
      // one never reorders what is already published.
      const maxOrder = (await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM pages
      `) as { next: number }[];

      const inserted = (await sql`
        INSERT INTO pages (slug, title, icon, content, status, sort_order, updated_by)
        VALUES (
          ${slugCheck.slug}, ${title}, ${icon || null}, ${JSON.stringify(content)}::jsonb,
          ${status}, ${maxOrder[0]?.next ?? 0}, ${user.userId}
        )
        RETURNING id, slug, title, icon, content, status, sort_order, created_at, updated_at
      `) as PageRow[];

      const row = inserted[0];
      if (!row) return res.status(500).json({ error: 'Could not create the page' });
      return res.status(201).json(rowToDto(row));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('pages')) {
      return res.status(503).json({
        error: 'Database schema is out of date. Run pnpm db:migrate against this deployment.',
      });
    }
    return res.status(500).json({ error: 'Request failed' });
  }
}
