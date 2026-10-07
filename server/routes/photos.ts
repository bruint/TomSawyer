import { Router } from "express";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { type DB } from "../db.js";

import { fail, nowIso, param } from "../http.js";

export function createPhotoRouter(db: DB) {
  const router = Router();
  router.post("/photos", async (req, res) => {
    const body = z.object({ data: z.string().max(5500000) }).parse(req.body);
    const match = body.data.match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/,
    );
    if (!match) fail(400, "Choose a JPEG, PNG or WebP photo.");
    const image = await sharp(Buffer.from(match![2], "base64"), {
      limitInputPixels: 25000000,
    })
      .rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const id = randomUUID();
    db.prepare("INSERT INTO photos VALUES (?,?,?,?)").run(
      id,
      res.locals.user.family_id,
      image,
      nowIso(),
    );
    res.status(201).json({ id });
  });
  router.get("/photos/:photoId", (req, res) => {
    const photo = db
      .prepare("SELECT image FROM photos WHERE id=? AND family_id=?")
      .get(param(req, "photoId"), res.locals.user.family_id);
    if (!photo) fail(404, "Photo not found.");
    res.type("image/webp").send(Buffer.from(photo!.image as Uint8Array));
  });

  return router;
}
