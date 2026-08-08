export const parseJsonBody = (raw: unknown): Record<string, unknown> => {
  if (raw === null) {
    return {};
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8") || "{}") as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
};
