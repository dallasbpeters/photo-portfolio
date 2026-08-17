import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAX_MODEL_LORA_FIELD,
  MAX_MODEL_LORA_SCALE,
  MAX_MODEL_LORA_TRIGGER,
  MODEL_IMAGE_PARAMS,
  MODEL_INPUTS,
  MODEL_OUTPUTS,
  PROTECTED_MODEL_ID,
} from "../../../config/models";
import type { FalModelInput } from "../../../config/nodeTypes";
import { modelsApi } from "../../services/portfolioService";
import type { AiModel, AiModelInput } from "../../types";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { inputLabel } from "./modelSummary";

/**
 * Adding a model, or changing one.
 *
 * Its own file because it is the larger half of the panel by a long way, and
 * ModelsPanel was at the size ceiling with no room to render this anywhere but
 * where it already did — which was the bug: the form appeared above the whole
 * list, so pressing Edit on the thirtieth row scrolled nothing and looked like
 * the button had done nothing at all. It is now rendered under the row being
 * edited, which needs no scrolling because that row is already in view.
 *
 * Every field's bounds come from config/models.ts, the same constants the API
 * validates against — a form that permitted what the endpoint refuses would
 * fail on save with a message about a rule nothing on screen mentioned.
 */

const labelClass = "text-[10px] uppercase tracking-widest text-white/90";
const inputClass =
  "min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors";
const hintClass = "text-xs text-white/50";

interface ModelFormProps {
  /** The model being edited, or null for a new one. */
  editing: AiModel | null;
  onCancel: () => void;
  onSaved: () => void;
}

export function ModelForm({ editing, onCancel, onSaved }: ModelFormProps) {
  const isNew = editing === null;
  const isAuto = !isNew && editing.id === PROTECTED_MODEL_ID;

  const [id, setId] = useState(editing?.id ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [input, setInput] = useState<FalModelInput>(
    editing?.input ?? "prompt-or-image"
  );
  const [output, setOutput] = useState(editing?.output ?? "image");
  const [imageParam, setImageParam] = useState(
    editing?.imageParam ?? "image_url"
  );
  const [vector, setVector] = useState(editing?.vector ?? false);
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const [sortOrder, setSortOrder] = useState(
    editing ? String(editing.sortOrder) : ""
  );
  const [isLora, setIsLora] = useState(Boolean(editing?.lora));
  const [loraPath, setLoraPath] = useState(editing?.lora?.path ?? "");
  const [loraScale, setLoraScale] = useState(
    editing?.lora?.scale !== null && editing?.lora?.scale !== undefined
      ? String(editing.lora.scale)
      : ""
  );
  const [loraTrigger, setLoraTrigger] = useState(editing?.lora?.trigger ?? "");
  const [loraEndpoint, setLoraEndpoint] = useState(
    editing?.lora?.endpoint ?? ""
  );
  const [loraImageEndpoint, setLoraImageEndpoint] = useState(
    editing?.lora?.imageEndpoint ?? ""
  );
  const [saving, setSaving] = useState(false);

  // Locked fields for the default: "auto" is what the API falls back to, and
  // its shape is what that fallback means.
  const shapeLocked = isAuto;

  const buildPayload = (): AiModelInput => {
    const payload: AiModelInput = {
      enabled,
      imageParam,
      input,
      label: label.trim(),
      output,
      sortOrder: sortOrder.trim() === "" ? undefined : Number(sortOrder),
      vector,
    };
    if (isNew) {
      payload.id = id.trim();
    }
    if (!shapeLocked) {
      payload.lora = isLora
        ? {
            endpoint: loraEndpoint.trim() || null,
            imageEndpoint: loraImageEndpoint.trim() || null,
            path: loraPath.trim(),
            scale: loraScale.trim() === "" ? null : Number(loraScale),
            trigger: loraTrigger.trim() || null,
          }
        : null;
    }
    return payload;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isNew) {
        await modelsApi.create(payload);
        toast.success("Model added");
      } else {
        await modelsApi.update(editing.id, payload);
        toast.success("Model saved");
      }
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the model"
      );
    } finally {
      setSaving(false);
    }
  };

  let submitLabel = "Save changes";
  if (isNew) {
    submitLabel = "Add model";
  } else if (saving) {
    submitLabel = "Saving…";
  }

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader>
        <CardTitle className="text-sm text-white/90 uppercase tracking-widest">
          {isNew ? "Add a model" : `Edit ${editing.label}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className={labelClass} htmlFor="model-id">
                Model id
              </Label>
              <Input
                className={inputClass}
                disabled={!isNew}
                id="model-id"
                onChange={(e) => setId(e.target.value)}
                placeholder="fal-ai/…"
                value={id}
              />
              {isNew ? null : (
                <p className={hintClass}>
                  The id cannot be changed once saved.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className={labelClass} htmlFor="model-label">
                Label
              </Label>
              <Input
                className={inputClass}
                id="model-label"
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Shown on the node"
                value={label}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className={labelClass} htmlFor="model-input">
                Consumes
              </Label>
              <Select
                onValueChange={(value) => {
                  if (value !== null) {
                    setInput(value);
                  }
                }}
                value={input}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MODEL_INPUTS.map((shape) => (
                      <SelectItem key={shape} value={shape}>
                        {inputLabel(shape)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={labelClass} htmlFor="model-output">
                Returns
              </Label>
              <Select
                data-size="md"
                onValueChange={(value) => {
                  if (value !== null) {
                    setOutput(value as "image" | "video");
                  }
                }}
                value={output}
              >
                <SelectTrigger id="model-output">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MODEL_OUTPUTS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {kind === "video" ? "Video" : "Image"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className={hintClass}>
                A video endpoint is reached through fal's queue rather than
                fal.run, because a clip takes minutes. A Video node offers only
                these; a Generate node offers only the others.
              </p>
            </div>
            <div className="space-y-1">
              <Label className={labelClass} htmlFor="model-image-param">
                Source-image parameter
              </Label>
              <Select
                data-size="md"
                onValueChange={(value) => {
                  if (value !== null) {
                    setImageParam(value);
                  }
                }}
                value={imageParam}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MODEL_IMAGE_PARAMS.map((param) => (
                      <SelectItem key={param} value={param}>
                        {param}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={vector}
                disabled={shapeLocked}
                id="model-vector"
                onChange={(e) => setVector(e.target.checked)}
              />
              <Label className={labelClass} htmlFor="model-vector">
                Returns vector art
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={enabled}
                disabled={isAuto}
                id="model-enabled"
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <Label className={labelClass} htmlFor="model-enabled">
                Enabled
              </Label>
            </div>
            <div className="space-y-1">
              <Label className={labelClass} htmlFor="model-sort">
                Position
              </Label>
              <Input
                className="min-h-11 w-24 bg-black/40 text-white"
                id="model-sort"
                min={0}
                onChange={(e) => setSortOrder(e.target.value)}
                type="number"
                value={sortOrder}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={isLora}
              disabled={shapeLocked}
              id="model-lora"
              onChange={(e) => setIsLora(e.target.checked)}
            />
            <Label className="text-sm text-white/80" htmlFor="model-lora">
              This is a LoRA style
            </Label>
          </div>

          {isLora ? (
            <div className="grid gap-3 rounded-md border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className={labelClass} htmlFor="lora-path">
                  Weights path
                </Label>
                <Input
                  className={inputClass}
                  id="lora-path"
                  maxLength={MAX_MODEL_LORA_FIELD}
                  onChange={(e) => setLoraPath(e.target.value)}
                  placeholder="https://…/model.safetensors"
                  value={loraPath}
                />
              </div>
              <div className="space-y-1">
                <Label className={labelClass} htmlFor="lora-scale">
                  Strength
                </Label>
                <Input
                  className={inputClass}
                  id="lora-scale"
                  max={MAX_MODEL_LORA_SCALE}
                  min={0}
                  onChange={(e) => setLoraScale(e.target.value)}
                  step={0.1}
                  type="number"
                  value={loraScale}
                />
              </div>
              <div className="space-y-1">
                <Label className={labelClass} htmlFor="lora-trigger">
                  Trigger token
                </Label>
                <Input
                  className={inputClass}
                  id="lora-trigger"
                  maxLength={MAX_MODEL_LORA_TRIGGER}
                  onChange={(e) => setLoraTrigger(e.target.value)}
                  placeholder="prepended to the prompt"
                  value={loraTrigger}
                />
              </div>
              <div className="space-y-1">
                <Label className={labelClass} htmlFor="lora-endpoint">
                  Base endpoint (optional)
                </Label>
                <Input
                  className={inputClass}
                  id="lora-endpoint"
                  maxLength={MAX_MODEL_LORA_FIELD}
                  onChange={(e) => setLoraEndpoint(e.target.value)}
                  placeholder="blank means Flux"
                  value={loraEndpoint}
                />
              </div>
              <div className="space-y-1">
                <Label className={labelClass} htmlFor="lora-image-endpoint">
                  Image-to-image endpoint (optional)
                </Label>
                <Input
                  className={inputClass}
                  id="lora-image-endpoint"
                  maxLength={MAX_MODEL_LORA_FIELD}
                  onChange={(e) => setLoraImageEndpoint(e.target.value)}
                  value={loraImageEndpoint}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button disabled={saving} type="submit" variant="outline">
              {submitLabel}
            </Button>
            <Button onClick={onCancel} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
