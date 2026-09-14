const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const outDir = path.join(__dirname, "..", "public", "backgrounds");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const W = 1280;
const H = 720;

const backgrounds = [
  {
    file: "office.jpg",
    svg: `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e2338"/>
      <stop offset="100%" stop-color="#3a3f5c"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${Array.from({ length: 6 })
    .map((_, i) => `<rect x="${100 + i * 190}" y="150" width="120" height="420" rx="6" fill="rgba(255,255,255,0.05)"/>`)
    .join("")}
</svg>`,
  },
  {
    file: "gradient-purple.jpg",
    svg: `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="30%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#0b0e17"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`,
  },
  {
    file: "gradient-blue.jpg",
    svg: `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0b0e17"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`,
  },
];

async function main() {
  for (const bg of backgrounds) {
    await sharp(Buffer.from(bg.svg)).jpeg({ quality: 85 }).toFile(path.join(outDir, bg.file));
    console.log("wrote", bg.file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
