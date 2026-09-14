const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const CATEGORIES = [
  { key: "office", query: "coworking space desks computers photograph", minWidth: 1000 },
  { key: "living-room", query: "cozy living room interior sofa", minWidth: 1400 },
  { key: "library", query: "bookshelf library room interior", minWidth: 1400 },
  { key: "forest", query: "green forest landscape trees daylight", minWidth: 1400 },
  { key: "beach", query: "tropical beach ocean sky", minWidth: 1400 },
  { key: "city-night", query: "downtown skyscrapers dusk lights cityscape", minWidth: 1400 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const outDir = path.join(__dirname, "..", "public", "backgrounds");
const srcDir = path.join(__dirname, "bg-src");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

async function search(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "15");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|extmetadata|mime");
  const res = await fetch(url.toString(), { headers: { "User-Agent": "MarvieBackgroundFetcher/1.0 (contact: n/a)" } });
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  return pages;
}

function isGoodCandidate(page, minWidth) {
  const info = page.imageinfo?.[0];
  if (!info) return false;
  if (!info.mime || !/^image\/(jpeg|png)$/.test(info.mime)) return false;
  if (info.width < minWidth) return false;
  if (info.width < info.height * 1.2) return false; // prefer landscape
  const title = (page.title || "").toLowerCase();
  if (/(logo|diagram|map|chart|icon|screenshot|graph)/.test(title)) return false;
  return true;
}

function attribution(page, key) {
  const meta = page.imageinfo?.[0]?.extmetadata ?? {};
  const strip = (html) => (html || "").replace(/<[^>]+>/g, "").trim();
  return {
    key,
    title: page.title,
    artist: strip(meta.Artist?.value),
    license: meta.LicenseShortName?.value ?? "unknown",
    source: page.imageinfo?.[0]?.descriptionurl,
  };
}

async function downloadTo(url, dest) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "MarvieBackgroundFetcher/1.0 (contact: n/a)" } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      return;
    }
    if (res.status === 429 && attempt < 3) {
      const wait = 20000 * (attempt + 1);
      console.log(`  429, retrying in ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`download failed ${res.status} for ${url}`);
  }
}

async function main() {
  const creditsPath = path.join(outDir, "CREDITS.json");
  const credits = fs.existsSync(creditsPath) ? JSON.parse(fs.readFileSync(creditsPath, "utf8")) : [];
  for (const cat of CATEGORIES) {
    if (cat.skip) continue;
    if (fs.existsSync(path.join(outDir, `${cat.key}.jpg`)) && credits.some((c) => c.key === cat.key)) {
      console.log("Already have", cat.key, "- skipping");
      continue;
    }
    console.log("Searching:", cat.key);
    const pages = await search(cat.query);
    const candidate = pages
      .filter((p) => isGoodCandidate(p, cat.minWidth))
      .sort((a, b) => b.imageinfo[0].width - a.imageinfo[0].width)[0];

    if (!candidate) {
      console.log("  no good candidate found for", cat.key);
      continue;
    }

    const info = candidate.imageinfo[0];
    const srcPath = path.join(srcDir, `${cat.key}-src${path.extname(info.url) || ".jpg"}`);
    console.log("  downloading", info.url);
    await downloadTo(info.url, srcPath);

    const destPath = path.join(outDir, `${cat.key}.jpg`);
    await sharp(srcPath)
      .resize(1280, 720, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82 })
      .toFile(destPath);
    console.log("  wrote", destPath);

    credits.push(attribution(candidate, cat.key));
    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));
    await sleep(3000);
  }

  console.log("Wrote credits for", credits.length, "images total");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
