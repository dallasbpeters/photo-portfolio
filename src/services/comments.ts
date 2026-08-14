import { apiBase, jsonHeaders } from "./portfolioService";

/** One comment on a board item. */
export interface BoardComment {
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  itemId: string;
  resolved: boolean;
  x: number;
  y: number;
}

const commentsUrl = (boardId: string): string =>
  `${apiBase()}/api/boards/${boardId}/comments`;

const readError = async (res: Response, fallback: string): Promise<string> => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || `${fallback} (${res.status})`;
};

export const commentsApi = {
  create: async (input: {
    authorName: string;
    body: string;
    boardId: string;
    itemId: string;
  }): Promise<BoardComment> => {
    const res = await fetch(commentsUrl(input.boardId), {
      body: JSON.stringify({
        authorName: input.authorName,
        body: input.body,
        itemId: input.itemId,
      }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not post the comment"));
    }
    return ((await res.json()) as { comment: BoardComment }).comment;
  },
  list: async (boardId: string): Promise<BoardComment[]> => {
    const res = await fetch(commentsUrl(boardId), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not load comments"));
    }
    return ((await res.json()) as { comments: BoardComment[] }).comments;
  },

  resolve: async (
    boardId: string,
    commentId: string,
    resolved: boolean
  ): Promise<BoardComment> => {
    const res = await fetch(`${commentsUrl(boardId)}/${commentId}`, {
      body: JSON.stringify({ resolved }),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not update the comment"));
    }
    return ((await res.json()) as { comment: BoardComment }).comment;
  },
};
