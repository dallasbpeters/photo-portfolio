import { Plus } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { modelsApi } from "../../services/portfolioService";
import type { AiModel } from "../../types";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useConfirm } from "./ConfirmProvider";
import { ModelForm } from "./ModelForm";
import { ModelRow } from "./ModelRow";

/**
 * The models a Generate node may use, editable without code.
 *
 * The list is data: add a model here with its exact fal id and it appears in
 * every node's picker and is accepted by the run endpoint. "auto" is the
 * default and is protected — it cannot be deleted, disabled, or given a
 * different shape.
 */
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
    <Card className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm text-white/90 uppercase tracking-widest">
          Models
        </CardTitle>
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
      <CardContent className="space-y-3">
        <p className="text-white/50 text-xs">
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
          <p className="text-sm text-white/50">No models yet.</p>
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
