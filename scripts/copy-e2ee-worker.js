const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "livekit-client", "dist", "livekit-client.e2ee.worker.js");
const destDir = path.join(__dirname, "..", "public");
const dest = path.join(destDir, "e2ee-worker.js");

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("copied e2ee worker to public/e2ee-worker.js");
