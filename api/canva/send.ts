import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { autofillDesign, uploadAsset, usableToken } from "../_lib/canva.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/** An image that Canva can be told to fetch must be a public URL. */
const HTTP_URL = /^https?:\/\//i;

/**
 * Sends an image into a Canva design: uploads it as an asset, then autofills
 * the chosen brand template's image field with it, creating a fresh design.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body) as {
    fieldKey?: unknown;
    imageUrl?: unknown;
    templateId?: unknown;
    title?: unknown;
  };
  const imageUrl =
    typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const templateId =
    typeof body.templateId === "string" ? body.templateId.trim() : "";
  const fieldKey =
    typeof body.fieldKey === "string" ? body.fieldKey.trim() : "";
  const title = typeof body.title === "string" ? body.title.slice(0, 255) : "";
  if (!(imageUrl && templateId && fieldKey)) {
    return res
      .status(400)
      .json({ error: "An image, a template and a field are required" });
  }
  if (!HTTP_URL.test(imageUrl)) {
    return res.status(400).json({ error: "The image must be a public URL" });
  }

  const sql = getSql();
  const token = await usableToken(sql, user.userId);
  if (!token) {
    return res.status(401).json({ error: "Connect your Canva account first" });
  }

  try {
    const assetId = await uploadAsset(token, imageUrl, title || "Board image");
    const designUrl = await autofillDesign(
      token,
      templateId,
      fieldKey,
      assetId,
      title
    );
    return res.status(200).json({ designUrl });
  } catch (err) {
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Canva failed" });
  }
}
