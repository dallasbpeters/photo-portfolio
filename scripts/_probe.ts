import { signToken } from "../api/_lib/auth.js";
import { getSql } from "../api/_lib/db.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();
const sql = getSql();

const users = await sql`SELECT id, email FROM users LIMIT 1`;
const token = signToken({ email: users[0].email, sub: String(users[0].id) });

// A throwaway element and board. Every case below is refused before fal is
// called, so none of this spends anything.
const [element] = await sql`
  INSERT INTO elements (name, description, cover_url, image_urls, created_by)
  VALUES ('PROBE element', 'muted greens, soft overcast light',
          'https://example.com/probe.svg', '[]'::jsonb, ${users[0].id})
  RETURNING id
`;
const [board] = await sql`
  INSERT INTO boards (title, created_by) VALUES ('PROBE board', ${users[0].id})
  RETURNING id
`;

const elementNode = crypto.randomUUID();
const generateNode = crypto.randomUUID();
await sql`
  INSERT INTO board_items (id, board_id, kind, node_type, config, x, y, z_index, width, height)
  VALUES
    (${elementNode}, ${board.id}, 'op', 'element',
     ${JSON.stringify({ elementId: element.id, imageUrl: "https://example.com/stored.webp", name: "PROBE" })}::jsonb,
     0, 0, 1, 380, 380),
    (${generateNode}, ${board.id}, 'op', 'generate',
     ${JSON.stringify({ count: 1, model: "auto" })}::jsonb,
     600, 0, 2, 380, 460)
`;
await sql`
  INSERT INTO board_wires (id, board_id, source_item_id, source_port, target_item_id, target_port)
  VALUES (${crypto.randomUUID()}, ${board.id}, ${elementNode}, 'out', ${generateNode}, 'image')
`;

const run = async () => {
  const res = await fetch(`http://localhost:3006/api/boards/${board.id}/run`, {
    body: JSON.stringify({ force: true, itemId: generateNode, variation: 0 }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  return { body: await res.json(), status: res.status };
};

console.log("A. cover is an SVG, description set:");
console.log("  ", JSON.stringify(await run()));

await sql`UPDATE elements SET cover_url = 'not-a-url' WHERE id = ${element.id}`;
console.log("B. cover unusable, description set:");
console.log("  ", JSON.stringify(await run()));

await sql`UPDATE elements SET description = NULL WHERE id = ${element.id}`;
console.log("C. cover unusable, description cleared:");
console.log("  ", JSON.stringify(await run()));

// What the node kept, since a refusal now records itself.
const [after] = await sql`
  SELECT run_state, run_error FROM board_items WHERE id = ${generateNode}
`;
console.log("recorded on the node:", after.run_state, "|", after.run_error);

await sql`DELETE FROM boards WHERE id = ${board.id}`;
await sql`DELETE FROM elements WHERE id = ${element.id}`;
console.log("cleaned up");
