import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
const outputDirectory = resolve("dist");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve("public"), outputDirectory, { recursive: true });

console.log("Built the static UI in dist/. Itinerary data is served by the Worker API.");
