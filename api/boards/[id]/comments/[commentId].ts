import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../../_lib/auth.js";
import { handleCors } from "../../../_lib/cors.js";
import { getSql } from "../../../_lib/db.js";
import { parseJsonBody } from "../../../_lib/parseBody.js";

/**
 * One comment: only the resolved flag is ever changed, and only by someone
 * signed in — marking a comment done is owning the board, not contributing to
 * it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const rawBoard = req.query.id;
  const boardId = Array.isArray(rawBoard) ? rawBoard[0] : rawBoard;
  const rawComment = req.query.commentId;
  const commentId = Array.isArray(rawComment) ? rawComment[0] : rawComment;
  if (!(boardId && commentId)) {
    return res
      .status(400)
      .json({ error: "A board and a comment are required" });
  }
  const body = parseJsonBody(req.body) as { resolved?: unknown };
  if (typeof body.resolved !== "boolean") {
    return res.status(400).json({ error: "resolved must be true or false" });
  }

  const sql = getSql();
  const updated = (await sql`
    UPDATE board_comments
    SET resolved = ${body.resolved}
    WHERE id = ${commentId} AND board_id = ${boardId}
    RETURNING id, author_name, body, created_at, item_id, resolved, x, y
  `) as {
    author_name: string;
    body: string;
    created_at: string;
    id: string;
    item_id: string;
    resolved: boolean;
    x: number;
    y: number;
  }[];

  if (updated.length === 0) {
    return res.status(404).json({ error: "That comment is not on this board" });
  }
  return res.status(200).json({
    comment: {
      authorName: updated[0].author_name,
      body: updated[0].body,
      createdAt: updated[0].created_at,
      id: updated[0].id,
      itemId: updated[0].item_id,
      resolved: updated[0].resolved,
      x: updated[0].x,
      y: updated[0].y,
    },
  });
}
