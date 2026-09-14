const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const outDir = path.join(__dirname, "..", "public");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function iconSvg({ size, padding }) {
  const r = size * 0.22;
  const inner = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const glyphScale = inner / 100;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${cx - 50 * glyphScale}, ${cy - 50 * glyphScale}) scale(${glyphScale})">
    <path d="M62 39.5V29a4 4 0 0 0-4-4H17a4 4 0 0 0-4 4v42a4 4 0 0 0 4 4h41a4 4 0 0 0 4-4V60.5l17 12.5V27l-17 12.5Z"
      fill="none" stroke="white" stroke-width="6.5" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function main() {
  const targets = [
    { file: "icon-192.png", size: 192, padding: 0 },
    { file: "icon-512.png", size: 512, padding: 0 },
    { file: "icon-maskable-512.png", size: 512, padding: 64 },
    { file: "apple-touch-icon.png", size: 180, padding: 0 },
  ];

  for (const t of targets) {
    const svg = iconSvg({ size: t.size, padding: t.padding });
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, t.file));
    console.log("wrote", t.file);
  }

  // favicon.ico from a small PNG rasterization (sharp can't write .ico directly, use 32px png as favicon.png fallback)
  const faviconSvg = iconSvg({ size: 64, padding: 0 });
  await sharp(Buffer.from(faviconSvg)).png().toFile(path.join(outDir, "favicon-64.png"));
  console.log("wrote favicon-64.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
