import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  MAX_COMMENT_BODY,
  MAX_COMMENT_NAME,
} from "../../../config/comments.js";
import { loadComments, postCommentToSlack } from "../../_lib/comments.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { parseJsonBody } from "../../_lib/parseBody.js";

/**
 * Comments on a board. Both routes are public: anyone can read the run of
 * comments on a published board, and anyone can add one.
 */

type Sql = ReturnType<typeof getSql>;

/** The shared insert result shape. */
interface CreatedComment {
  author_name: string;
  body: string;
  created_at: string;
  id: string;
  item_id: string;
  resolved: boolean;
  x: number;
  y: number;
}

const toDto = (row: CreatedComment) => ({
  authorName: row.author_name,
  body: row.body,
  createdAt: row.created_at,
  id: row.id,
  itemId: row.item_id,
  resolved: row.resolved,
  x: row.x,
  y: row.y,
});

/** Creates a comment, or responds with the reason it cannot be. */
const createComment = async (
  sql: Sql,
  boardId: string,
  body: Record<string, unknown>,
  res: VercelResponse
) => {
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const authorName =
    typeof body.authorName === "string"
      ? body.authorName.trim().slice(0, MAX_COMMENT_NAME)
      : "";
  const comment =
    typeof body.body === "string"
      ? body.body.trim().slice(0, MAX_COMMENT_BODY)
      : "";
  if (!(itemId && authorName && comment)) {
    return res
      .status(400)
      .json({ error: "A name, a comment and an item are required" });
  }

  // The item must actually be on this board — an id from elsewhere would
  // otherwise pin a comment to nothing.
  const item = (await sql`
    SELECT kind, node_type FROM board_items
    WHERE id = ${itemId} AND board_id = ${boardId} LIMIT 1
  `) as { kind: string; node_type: string | null }[];
  if (item.length === 0) {
    return res.status(400).json({ error: "That item is not on this board" });
  }

  const x =
    typeof body.x === "number" && Number.isFinite(body.x)
      ? Math.min(1, Math.max(0, body.x))
      : 0.5;
  const y =
    typeof body.y === "number" && Number.isFinite(body.y)
      ? Math.min(1, Math.max(0, body.y))
      : 0.5;

  const created = (await sql`
    INSERT INTO board_comments (board_id, item_id, author_name, body, x, y)
    VALUES (${boardId}, ${itemId}, ${authorName}, ${comment}, ${x}, ${y})
    RETURNING id, author_name, body, created_at, item_id, resolved, x, y
  `) as CreatedComment[];

  const board = (await sql`
    SELECT title FROM boards WHERE id = ${boardId} LIMIT 1
  `) as { title: string }[];
  await postCommentToSlack({
    authorName,
    boardTitle: board[0]?.title ?? "a board",
    body: comment,
    itemLabel: item[0].node_type ?? item[0].kind,
  });

  return res.status(201).json({ comment: toDto(created[0]) });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  if (!boardId) {
    return res.status(400).json({ error: "A board id is required" });
  }
  const sql = getSql();

  if (req.method === "GET") {
    return res.status(200).json({ comments: await loadComments(sql, boardId) });
  }

  if (req.method === "POST") {
    return createComment(
      sql,
      boardId,
      parseJsonBody(req.body) as Record<string, unknown>,
      res
    );
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
