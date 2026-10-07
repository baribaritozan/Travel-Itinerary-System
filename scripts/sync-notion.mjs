import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildTripPayload, plainText, queryDataSource } from "./notion.mjs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export async function syncNotion(outputDirectory = resolve("dist")) {
  const token = required("NOTION_TOKEN");
  const tripSlug = required("TRIP_SLUG");
  const publishFilter = { property: "Publish", checkbox: { equals: true } };

  const [tripPages, placePages, itemPages] = await Promise.all([
    queryDataSource({ token, dataSourceId: required("NOTION_TRIPS_DATA_SOURCE_ID"), filter: publishFilter }),
    queryDataSource({ token, dataSourceId: required("NOTION_PLACES_DATA_SOURCE_ID"), filter: publishFilter }),
    queryDataSource({ token, dataSourceId: required("NOTION_ITEMS_DATA_SOURCE_ID"), filter: publishFilter }),
  ]);

  const tripPage = tripPages.find((page) => plainText(page.properties.Slug) === tripSlug);
  if (!tripPage) throw new Error(`Published trip with Slug "${tripSlug}" was not found.`);

  const payload = buildTripPayload({ tripPage, placePages, itemPages });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "data.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}
