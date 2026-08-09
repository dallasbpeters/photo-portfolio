import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { BoardEditor } from "../components/admin/BoardEditor";
import { ConfirmProvider } from "../components/admin/ConfirmProvider";
import { authStorage } from "../services/portfolioService";

/**
 * A board on its own route, so the work survives a reload.
 *
 * The editor autosaves, but a board held only in the admin's local state would
 * still be lost on refresh — and worse, the browser's back button would leave
 * the whole admin rather than the board. A URL fixes both, and makes a board
 * something you can bookmark and come back to.
 */
export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [isAuthenticated] = useState(() => Boolean(authStorage.getToken()));

  useEffect(() => {
    // Signing in happens on the admin route; there is no board to show without
    // it, and the API would refuse the request anyway.
    if (!isAuthenticated) {
      navigate("/admin", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!(isAuthenticated && boardId)) {
    return null;
  }

  return (
    <ConfirmProvider>
      <Toaster position="top-center" theme="dark" />
      <BoardEditor boardId={boardId} onClose={() => navigate("/admin")} />
    </ConfirmProvider>
  );
}
