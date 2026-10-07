import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
const svg = await readFile("public/icon.svg");
for (const [size, name] of [
  [192, "icon-192"],
  [512, "icon-512"],
  [180, "apple-touch-icon"],
])
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${name}.png`);
