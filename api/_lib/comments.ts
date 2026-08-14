import type { getSql } from "./db.js";

type Sql = ReturnType<typeof getSql>;

/** A Slack incoming-webhook URL, for posting new comments. Optional. */
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim() ?? "";

/** A row of the board_comments table, as selected by the queries below. */
export interface CommentRow {
  author_name: string;
  body: string;
  created_at: string;
  id: string;
  item_id: string;
  resolved: boolean;
  x: number;
  y: number;
}

export interface CommentDto {
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  itemId: string;
  resolved: boolean;
  x: number;
  y: number;
}

export const commentDto = (row: CommentRow): CommentDto => ({
  authorName: row.author_name,
  body: row.body,
  createdAt: row.created_at,
  id: row.id,
  itemId: row.item_id,
  resolved: row.resolved,
  x: row.x,
  y: row.y,
});

export const loadComments = async (
  sql: Sql,
  boardId: string
): Promise<CommentDto[]> => {
  const rows = (await sql`
    SELECT author_name, body, created_at, id, item_id, resolved, x, y
    FROM board_comments
    WHERE board_id = ${boardId}
    ORDER BY created_at ASC
  `) as CommentRow[];
  return rows.map(commentDto);
};

/** Sends a new comment to Slack, if a webhook is configured. Never throws. */
export const postCommentToSlack = async (input: {
  authorName: string;
  body: string;
  boardTitle: string;
  itemLabel: string;
}): Promise<void> => {
  if (!SLACK_WEBHOOK_URL) {
    return;
  }
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      body: JSON.stringify({
        text: `💬 New comment on *${input.boardTitle}* (${input.itemLabel})\n> *${input.authorName}:* ${input.body}`,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // A comment is still saved even if Slack is unreachable; the webhook is
    // best-effort and must never be the thing that loses the comment.
  }
};
