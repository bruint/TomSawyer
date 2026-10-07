import type { DB } from "./db.js";

export function removeUnusedPhotos(db: DB, ids: string[]) {
  for (const id of ids)
    db.prepare(
      "DELETE FROM photos WHERE id=? AND NOT EXISTS(SELECT 1 FROM activities WHERE json_extract(details,'$.photoId')=?)",
    ).run(id, id);
}
