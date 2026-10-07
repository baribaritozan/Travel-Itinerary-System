import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { syncNotion } from "./sync-notion.mjs";

const outputDirectory = resolve("dist");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve("public"), outputDirectory, { recursive: true });

if (process.argv.includes("--sample")) {
  await cp(resolve("sample-data.json"), resolve(outputDirectory, "data.json"));
  console.log("Built dist/ with sample data.");
} else {
  const payload = await syncNotion(outputDirectory);
  console.log(`Built dist/ for ${payload.trip.name} (${payload.items.length} items).`);
}
