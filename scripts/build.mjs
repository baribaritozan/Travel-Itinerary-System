import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
const output = resolve("dist");
if (basename(output) !== "dist" || !output.startsWith(resolve() + "/") && !output.startsWith(resolve() + "\\")) throw new Error("invalid output");
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "assets/images"), { recursive: true });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = [];
async function asset(name, bytes) {
  const dot = name.lastIndexOf("."), path = `/assets/${name.slice(0, dot)}.${digest(bytes).slice(0, 16)}${name.slice(dot)}`;
  await writeFile(resolve(output, path.slice(1)), bytes);
  manifest.push({ url: path, hash: digest(bytes) }); return path;
}
const assets = {};
for (const name of ["model.mjs", "offline.mjs", "pwa.mjs", "styles.css"]) assets[name] = await asset(name, await readFile(`public/${name}`));
assets["leaflet.js"] = await asset("leaflet.js", await readFile("node_modules/leaflet/dist/leaflet.js"));
assets["leaflet.css"] = await asset("leaflet.css", await readFile("node_modules/leaflet/dist/leaflet.css"));
for (const name of ["marker-icon.png", "marker-icon-2x.png", "marker-shadow.png", "layers.png", "layers-2x.png"]) {
  const bytes = await readFile(`node_modules/leaflet/dist/images/${name}`), url = `/assets/images/${name}`;
  await writeFile(resolve(output, url.slice(1)), bytes); manifest.push({ url, hash: digest(bytes) });
}
await cp("node_modules/leaflet/LICENSE", resolve(output, "leaflet-LICENSE.txt"));
let app = await readFile("public/app.js", "utf8");
for (const [name, path] of Object.entries(assets)) app = app.replaceAll(`./${name}`, path);
assets["app.js"] = await asset("app.js", app);
let html = await readFile("public/index.html", "utf8");
for (const [name, path] of Object.entries(assets)) html = html.replaceAll(`./${name}`, path);
await writeFile(resolve(output, "index.html"), html); manifest.push({ url: "/index.html", hash: digest(html) });
// Code-native route icon, with PNGs for mobile installation surfaces.
function png(size) {
  const crc = bytes => { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = n >>> 1 ^ (n & 1 ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (type, bytes) => { const label = Buffer.from(type), length = Buffer.alloc(4), check = Buffer.alloc(4); length.writeUInt32BE(bytes.length); check.writeUInt32BE(crc(Buffer.concat([label, bytes]))); return Buffer.concat([length, label, bytes, check]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const route = Math.abs(u - .34) < .035 && v > .3 && v < .7 || Math.abs(v - .67) < .035 && u > .34 && u < .68;
    const point = Math.hypot(u - .34, v - .3) < .085 || Math.hypot(u - .68, v - .67) < .085;
    raw.set(point ? [209, 120, 89, 255] : route ? [248, 245, 236, 255] : [22, 58, 53, 255], y * (size * 4 + 1) + 1 + x * 4);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const size of [192, 512]) { const bytes = png(size), url = `/icon-${size}.png`; await writeFile(resolve(output, url.slice(1)), bytes); manifest.push({ url, hash: digest(bytes) }); }
await cp("public/manifest.webmanifest", resolve(output, "manifest.webmanifest"));
manifest.push({ url: "/manifest.webmanifest", hash: digest(await readFile("public/manifest.webmanifest")) });
await cp("public/_headers", resolve(output, "_headers"));
const template = await readFile("public/sw.js", "utf8");
const version = digest(JSON.stringify(manifest) + template).slice(0, 16);
const sw = template.replace("__PRECACHE__", JSON.stringify(manifest)).replaceAll("__VERSION__", version);
await writeFile(resolve(output, "sw.js"), sw);
await writeFile(resolve(output, "asset-manifest.json"), JSON.stringify({ version, assets, precache: manifest }, null, 2));
console.log(`Built ${version}: ${manifest.length} verified offline files; no API or map tiles.`);
