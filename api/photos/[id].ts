import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from '../_lib/db.js';
import { getBearerUser } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';
import { parseJsonBody } from '../_lib/parseBody.js';
import { rowToDto, type PhotoRow } from '../_lib/photos.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const id = typeof req.query.id === 'string' ? req.query.id : req.query.id?.[0];
  if (!id) {
    return res.status(400).json({ error: 'Missing photo id' });
  }

  if (req.method === 'PATCH') {
    const user = getBearerUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = parseJsonBody(req.body);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const order = typeof body.order === 'number' ? body.order : Number(body.order);
    const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;

    if (!title || !categoryId) {
      return res.status(400).json({ error: 'Invalid title or categoryId' });
    }
    if (!Number.isFinite(order)) {
      return res.status(400).json({ error: 'Invalid order' });
    }

    try {
      const sql = getSql();
      const catOk = await sql`SELECT id FROM categories WHERE id = ${categoryId} LIMIT 1`;
      if (catOk.length === 0) {
        return res.status(400).json({ error: 'Unknown category' });
      }

      const rows = (await sql`
        WITH u AS (
          UPDATE photos
          SET title = ${title}, category_id = ${categoryId}, sort_order = ${order},
            url = COALESCE(${url}, url)
          WHERE id = ${id}
          RETURNING id
        )
        SELECT p.id, p.url, p.title, p.sort_order, p.created_at,
          c.id AS category_id, c.slug AS category_slug, c.label AS category_label
        FROM u
        JOIN photos p ON p.id = u.id
        JOIN categories c ON c.id = p.category_id
      `) as PhotoRow[];

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const row = rows[0];
      if (!row) {
        return res.status(500).json({ error: 'Update failed' });
      }
      return res.status(200).json(rowToDto(row));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Update failed' });
    }
  }

  if (req.method === 'DELETE') {
    const user = getBearerUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const sql = getSql();
      const deleted = await sql`
        DELETE FROM photos
        WHERE id = ${id}
        RETURNING id
      `;

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      return res.status(204).end();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
