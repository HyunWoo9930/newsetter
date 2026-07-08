// ClimbCrew 아이콘 SVG → PNG 변환 (카카오 콘솔 업로드용)
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/brand/climbcrew-icon.svg");
for (const size of [512, 1024]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/brand/climbcrew-icon-${size}.png`);
  console.log(`wrote public/brand/climbcrew-icon-${size}.png`);
}
