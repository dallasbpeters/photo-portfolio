import { Plus } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { pollTraining } from "../../boards/io/dataset";
import { modelsApi } from "../../services/portfolioService";
import type { AiModel } from "../../types";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useConfirm } from "./ConfirmProvider";
import { ModelForm } from "./ModelForm";
import { ModelRow } from "./ModelRow";
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";

/**
 * The models a Generate node may use, editable without code.
 *
 * The list is data: add a model here with its exact fal id and it appears in
 * every node's picker and is accepted by the run endpoint. "auto" is the
 * default and is protected — it cannot be deleted, disabled, or given a
 * different shape.
 */
/**
 * How often to ask fal whether a training has landed.
 *
 * A run takes minutes, so this is not about being quick — it is about
 * the row turning itself on within a minute of finishing rather than needing a
 * reload. Half a minute costs two requests a minute against a job that is
 * already paid for.
 */
const TRAINING_POLL_MS = 30_000;

export function ModelsPanel() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [editing, setEditing] = useState<AiModel | "new" | null>(null);
  const { confirm } = useConfirm();

  const close = useCallback(() => setEditing(null), []);

  const refresh = useCallback(async () => {
    try {
      setModels(await modelsApi.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load models");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * Collects any training fal has finished, while this panel is open.
   *
   * The panel rather than a timer somewhere central, because this is the screen
   * where somebody is waiting — and because it means a training survives the
   * app being closed: nothing is holding the job, so the next visit collects
   * it. See api/models/training.ts.
   *
   * Only while something is actually training, so an admin editing models is
   * not polling fal every half minute for nothing. `refresh` runs when a run
   * lands, which is what makes the row switch itself on.
   */
  const training = models.some((m) => m.training?.status === "training");

  useEffect(() => {
    if (!training) {
      return;
    }
    let alive = true;
    const check = async () => {
      try {
        const { finished } = await pollTraining();
        if (alive && finished.length > 0) {
          toast.success(
            finished.length === 1
              ? `"${finished[0].label}" is trained and ready.`
              : `${finished.length} styles are trained and ready.`
          );
          await refresh();
        }
      } catch {
        // A failed check is not a failed training. The next tick tries again,
        // and saying so every thirty seconds would be noise about something
        // the admin cannot act on.
      }
    };
    void check();
    const timer = setInterval(() => void check(), TRAINING_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [training, refresh]);

  const saved = useCallback(() => {
    setEditing(null);
    void refresh();
  }, [refresh]);

  const handleRemoved = async (model: AiModel): Promise<void> => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description:
        "Boards already set to this model fall back to Auto. This cannot be undone.",
      destructive: true,
      title: `Delete "${model.label}"?`,
    });
    if (!ok) {
      return;
    }
    try {
      await modelsApi.remove(model.id);
      toast.success("Model deleted");
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete that model"
      );
    }
  };

  const handleToggled = async (model: AiModel): Promise<void> => {
    try {
      await modelsApi.update(model.id, { enabled: !model.enabled });
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not toggle that model"
      );
    }
  };

  const handleMoved = async (id: string, direction: -1 | 1): Promise<void> => {
    const index = models.findIndex((model) => model.id === id);
    const other = models[index + direction];
    if (index < 0 || !other) {
      return;
    }
    try {
      await modelsApi.update(id, { sortOrder: other.sortOrder });
      await modelsApi.update(other.id, { sortOrder: models[index].sortOrder });
      void refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not reorder models"
      );
    }
  };

  return (
    <Card className="admin-card">
      <CardHeader className="row row--between">
        <CardTitle className="admin-heading">Models</CardTitle>
        <Button
          onClick={() =>
            setEditing((current) => (current === "new" ? null : "new"))
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus size={14} />
          {editing === "new" ? "Close" : "Add model"}
        </Button>
      </CardHeader>
      <CardContent className="stack stack--mid">
        <p className="admin-note--quiet">
          These are the models a Generate node may use. Add a fal.ai model id,
          give it a label and its input shape, and it appears in every node
          without a code change.
        </p>

        {/* A new model has no row to sit under, so it opens where the button
            that asked for it is. */}
        {editing === "new" ? (
          <ModelForm editing={null} onCancel={close} onSaved={saved} />
        ) : null}

        {models.length === 0 ? (
          <p className="admin-empty">No models yet.</p>
        ) : (
          models.map((model, index) => (
            <Fragment key={model.id}>
              <ModelRow
                isFirst={index === 0}
                isLast={index === models.length - 1}
                model={model}
                onEdit={() => setEditing(model)}
                onMoved={(id, direction) => void handleMoved(id, direction)}
                onRemoved={(m) => void handleRemoved(m)}
                onToggled={(m) => void handleToggled(m)}
              />
              {/* Under the row it belongs to, rather than above the whole list.
                  With thirty models the form opened somewhere off screen and
                  pressing Edit looked like it had done nothing — and the row it
                  was editing was nowhere near the fields describing it. */}
              {editing !== "new" && editing?.id === model.id ? (
                <ModelForm editing={model} onCancel={close} onSaved={saved} />
              ) : null}
            </Fragment>
          ))
        )}
      </CardContent>
    </Card>
  );
}
