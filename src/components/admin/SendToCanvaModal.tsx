import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { type CanvaTemplate, canvaApi } from "../../services/canva";

interface SendToCanvaModalProps {
  imageUrl: string;
  /** What to call the design and the uploaded asset. */
  name: string;
  onClose: () => void;
}

type Stage =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "connecting" }
  | { kind: "templates" }
  | { kind: "sending" }
  | { kind: "done" };

interface TemplatePickerProps {
  chosen: string | null;
  field: string;
  fields: string[];
  fieldsStatus: "empty" | "idle" | "loading" | "ok";
  onChoose: (id: string) => void;
  onField: (name: string) => void;
  templates: CanvaTemplate[];
  upsellUrl: string;
}

/**
 * The template grid and the chosen template's image-field picker.
 *
 * Split out of the modal to keep the stage handling readable — the grid alone
 * carries more branching than the rest of the dialog.
 */
function TemplatePicker({
  chosen,
  field,
  fields,
  fieldsStatus,
  onChoose,
  onField,
  templates,
  upsellUrl,
}: TemplatePickerProps) {
  return (
    <>
      <p className="mt-4 mb-2 text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
        Design
      </p>
      <div className="grid max-h-52 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 overflow-y-auto">
        {templates.map((template) => (
          <button
            className={`relative aspect-square overflow-hidden rounded-lg border transition-colors ${
              chosen === template.id
                ? "border-board-ink/70"
                : "border-board-ink/10 hover:border-board-ink/40"
            }`}
            key={template.id}
            onClick={() => onChoose(template.id)}
            type="button"
          >
            {template.thumbnail ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                height={112}
                loading="lazy"
                src={template.thumbnail.url}
                width={112}
              />
            ) : null}
            <span className="absolute inset-x-0 bottom-0 bg-board-surface/70 px-1 py-0.5 text-[9px] text-board-ink/90 backdrop-blur-sm">
              {template.title}
            </span>
          </button>
        ))}
      </div>

      {fields.length > 1 ? (
        <label className="mt-4 block">
          <span className="mb-1 block text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
            Image field
          </span>
          <select
            className="w-full rounded border border-board-ink/15 bg-board-surface/30 px-2 py-1.5 text-[12px] text-board-ink outline-none focus:border-board-ink/45"
            onChange={(e) => onField(e.target.value)}
            value={field}
          >
            {fields.map((fieldName) => (
              <option key={fieldName} value={fieldName}>
                {fieldName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {chosen && fieldsStatus === "empty" ? (
        <p className="mt-4 text-[12px] text-amber-200/90 leading-relaxed">
          This template has no autofill image fields, so a photo can't be placed
          into it. In Canva, open the template and enable its autofill fields,
          then reload.
        </p>
      ) : null}

      {upsellUrl ? (
        <p className="mt-4 rounded border border-amber-300/30 bg-amber-400/10 p-3 text-[12px] text-amber-200/90 leading-relaxed">
          You've used up Canva's free autofill trial, so the image can't be
          placed into a design.{" "}
          <a
            className="underline"
            href={upsellUrl}
            rel="noopener"
            target="_blank"
          >
            Upgrade to Canva Enterprise
          </a>{" "}
          to keep sending.
        </p>
      ) : null}
    </>
  );
}

/**
 * Sending one image into a Canva design.
 *
 * Opens Canva's consent screen in a new tab when the account is not connected
 * (the modal polls until the handshake lands), then walks through the user's
 * brand templates to the image field the image should fill. The actual upload
 * and autofill happen server-side, so the browser never sees a Canva token.
 *
 * Board chrome, not the shadcn Dialog, for the same reason ElementModal is.
 */
export function SendToCanvaModal({
  imageUrl,
  name,
  onClose,
}: SendToCanvaModalProps) {
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [templates, setTemplates] = useState<CanvaTemplate[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [field, setField] = useState<string>("");
  const [designUrl, setDesignUrl] = useState("");
  const [upsellUrl, setUpsellUrl] = useState("");
  const [fieldsStatus, setFieldsStatus] = useState<
    "empty" | "idle" | "loading" | "ok"
  >("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The chosen template's image fields, fetched when one is picked.
  useEffect(() => {
    if (!chosen) {
      setFieldsStatus("idle");
      setFields([]);
      setField("");
      return;
    }
    let cancelled = false;
    setFieldsStatus("loading");
    void canvaApi
      .templateFields(chosen)
      .then((names) => {
        if (cancelled) {
          return;
        }
        setFields(names);
        setField(names[0] ?? "");
        setFieldsStatus(names.length > 0 ? "ok" : "empty");
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        toast.error(
          err instanceof Error ? err.message : "Could not load fields"
        );
        setFieldsStatus("empty");
      });
    return () => {
      cancelled = true;
    };
  }, [chosen]);

  const loadTemplates = useCallback(async () => {
    setStage({ kind: "connecting" });
    try {
      setTemplates(await canvaApi.templates());
      setStage({ kind: "templates" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load templates"
      );
      setStage({ kind: "unconfigured" });
    }
  }, []);

  // On first open: is Canva ready for this admin?
  useEffect(() => {
    let cancelled = false;
    void canvaApi
      .status()
      .then((status) => {
        if (cancelled) {
          return;
        }
        if (!status.configured) {
          setStage({ kind: "unconfigured" });
          return;
        }
        if (!status.connected) {
          setStage({ kind: "connecting" });
          return;
        }
        void loadTemplates();
      })
      .catch(() => {
        if (!cancelled) {
          setStage({ kind: "unconfigured" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadTemplates]);

  const connect = async () => {
    try {
      const url = await canvaApi.connect(window.location.pathname);
      window.open(url, "_blank", "noopener");
      // The handshake ends back on this board; poll until it has.
      const timer = window.setInterval(() => {
        void canvaApi.status().then(async (status) => {
          if (!status.connected) {
            return;
          }
          window.clearInterval(timer);
          await loadTemplates();
        });
      }, 1500);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not connect to Canva"
      );
    }
  };

  const send = async () => {
    if (!(chosen && field)) {
      return;
    }
    setStage({ kind: "sending" });
    try {
      const url = await canvaApi.send({
        fieldKey: field,
        imageUrl,
        templateId: chosen,
        title: name,
      });
      // The upload and autofill take tens of seconds, so the browser no longer
      // treats this as a user gesture by the time the URL arrives — a
      // window.open here is silently blocked. Show a link instead, which opens
      // in the tab's own gesture.
      setDesignUrl(url);
      setStage({ kind: "done" });
    } catch (err) {
      const upsell = (err as Error & { upsellUrl?: string }).upsellUrl;
      if (upsell) {
        setUpsellUrl(upsell);
      }
      toast.error(
        err instanceof Error ? err.message : "Could not send to Canva"
      );
      setStage({ kind: "templates" });
    }
  };

  const readyToSend =
    stage.kind === "templates" && chosen && fieldsStatus === "ok" && field;
  const isSending = stage.kind === "sending";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button
        aria-label="Cancel"
        className="absolute inset-0 cursor-default bg-board-surface/70 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <div className="relative flex max-h-full w-[min(92vw,42rem)] flex-col overflow-hidden rounded-xl border border-board-ink/15 bg-board-panel shadow-2xl">
        <header className="shrink-0 border-board-ink/10 border-b px-4 py-3">
          <h2 className="text-[11px] text-board-ink uppercase tracking-[0.18em]">
            Send to Canva
          </h2>
          <p className="mt-1 text-[11px] text-board-ink/45 leading-relaxed">
            The image is uploaded and autofilled into a design you can edit.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex items-start gap-3">
            <img
              alt=""
              className="size-20 shrink-0 rounded-lg border border-board-ink/10 object-cover"
              height={80}
              src={imageUrl}
              width={80}
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] text-board-ink">{name}</p>
              {stage.kind === "connecting" ? (
                <p className="mt-1 text-[11px] text-board-ink/50 leading-relaxed">
                  {templates.length === 0
                    ? "Loading your Canva account…"
                    : "Loading your brand templates…"}
                </p>
              ) : null}
            </div>
          </div>

          {stage.kind === "unconfigured" ? (
            <p className="mt-4 text-[12px] text-red-300/90 leading-relaxed">
              Canva is not connected. Set CANVA_CLIENT_ID to enable it, then
              reload.
            </p>
          ) : null}

          {stage.kind === "done" ? (
            <p className="mt-4 text-[12px] text-emerald-200/90 leading-relaxed">
              Your design is ready. Open it in Canva to edit, then save it to
              your brand.
            </p>
          ) : null}

          {stage.kind === "sending" ? (
            <p className="mt-4 text-[12px] text-board-ink/50 leading-relaxed">
              Uploading your image and building the design… this can take a
              minute.
            </p>
          ) : null}

          {stage.kind === "connecting" && templates.length === 0 ? (
            <button
              className="mt-4 rounded bg-board-ink/15 px-3 py-1.5 text-[12px] text-board-ink hover:bg-board-ink/25"
              onClick={() => void connect()}
              type="button"
            >
              Connect your Canva account
            </button>
          ) : null}

          {stage.kind === "templates" && templates.length === 0 ? (
            <p className="mt-4 text-[12px] text-board-ink/50 leading-relaxed">
              No brand templates found. Publish one from Canva first, then
              reload.
            </p>
          ) : null}

          {stage.kind === "templates" && templates.length > 0 ? (
            <TemplatePicker
              chosen={chosen}
              field={field}
              fields={fields}
              fieldsStatus={fieldsStatus}
              onChoose={setChosen}
              onField={setField}
              templates={templates}
              upsellUrl={upsellUrl}
            />
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-board-ink/10 border-t px-4 py-3">
          <button
            className="rounded px-2.5 py-1.5 text-[12px] text-board-ink/50 hover:text-board-ink"
            onClick={onClose}
            type="button"
          >
            {stage.kind === "done" ? "Close" : "Cancel"}
          </button>
          {stage.kind === "done" ? (
            <a
              className="rounded bg-board-ink/15 px-3 py-1.5 text-[12px] text-board-ink hover:bg-board-ink/25"
              href={designUrl}
              rel="noopener"
              target="_blank"
            >
              Open in Canva
            </a>
          ) : (
            <button
              className="rounded bg-board-ink/15 px-3 py-1.5 text-[12px] text-board-ink hover:bg-board-ink/25 disabled:opacity-40"
              disabled={!readyToSend || isSending}
              onClick={() => void send()}
              type="button"
            >
              {isSending ? "Sending…" : "Send to Canva"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
