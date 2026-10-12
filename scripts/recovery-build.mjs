import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const ref = process.argv[2] || "phase4-baseline-20261012";
const output = resolve("artifacts/phase4-recovery-dist");
await mkdir(output, { recursive: true });
for (const file of ["index.html", "app.js", "model.mjs", "styles.css", "_headers"]) {
  const bytes = execFileSync("git", ["show", `${ref}:public/${file}`]);
  await writeFile(resolve(output, file), file === "_headers" ? Buffer.concat([bytes, Buffer.from("\n/sw.js\n  Cache-Control: no-cache\n")]) : bytes);
}
await writeFile(resolve(output, "sw.js"), await readFile("scripts/recovery-sw.js"));
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
config.main = resolve(config.main); config.assets.directory = output;
await writeFile("artifacts/phase4-recovery-wrangler.jsonc", JSON.stringify(config, null, 2));
console.log(`Recovery prepared from ${ref}: ${output}. Use the generated config with the existing Worker.`);
