import { compareItems, safeUrl } from "../public/model.mjs";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

export function normalizeId(value = "") {
  return String(value).replaceAll("-", "").toLowerCase();
}

export function plainText(property) {
  const values = property?.title ?? property?.rich_text ?? [];
  return values.map((value) => value.plain_text ?? value.text?.content ?? "").join("");
}

export function selectName(property) {
  return property?.select?.name ?? property?.status?.name ?? null;
}

export function relationIds(property) {
  return (property?.relation ?? []).map((relation) => normalizeId(relation.id));
}

export function dateValue(property) {
  return {
    start: property?.date?.start ?? null,
    end: property?.date?.end ?? null,
    timeZone: property?.date?.time_zone ?? null,
  };
}

function numberValue(property) {
  return typeof property?.number === "number" ? property.number : null;
}

function urlValue(property) {
  const value = safeUrl(property?.url);
  return value && !/(^|\.)notion\.(so|site)$/i.test(new URL(value).hostname) ? value : null;
}

function phoneValue(property) {
  return property?.phone_number ?? null;
}

function requireValue(condition, message, errors) {
  if (!condition) errors.push(message);
}

export function normalizeDate(value, timeZone) {
  if (!value) return null;
  const calendar = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (!calendar || !Number.isFinite(Date.parse(calendar)) || new Date(calendar).toISOString().slice(0, 10) !== calendar) throw new Error("Invalid calendar date");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date");
    return value;
  }
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    if (!Number.isFinite(Date.parse(value))) throw new Error("Invalid timestamp");
    return new Date(value).toISOString();
  }
  // Notion may return a wall time alongside date.time_zone, without an offset.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) throw new Error("Invalid timestamp");
  const target = Date.parse(`${value}Z`);
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const wall = formatter.format(new Date(instant)).replace(" ", "T");
    const correction = target - (Date.parse(`${wall}Z`) + ((instant % 1000) + 1000) % 1000);
    if (!correction) return new Date(instant).toISOString();
    instant += correction;
  }
  throw new Error("Nonexistent local timestamp");
}

function validatedPeriod(period, timeZone, label, errors) {
  try {
    const start = normalizeDate(period.start, period.timeZone || timeZone);
    const end = normalizeDate(period.end, period.timeZone || timeZone);
    requireValue(!end || (start && Date.parse(end) >= Date.parse(start)), `${label}: end precedes start.`, errors);
    return { start, end };
  } catch {
    errors.push(`${label}: invalid date or timezone.`);
    return { start: null, end: null };
  }
}

export function buildTripPayload({ tripPage, placePages, itemPages, generatedAt = new Date().toISOString() }) {
  const errors = [];
  const tripPeriod = dateValue(tripPage.properties.Period);
  const trip = {
    id: normalizeId(tripPage.id),
    name: plainText(tripPage.properties.Trip),
    slug: plainText(tripPage.properties.Slug),
    start: tripPeriod.start,
    end: tripPeriod.end,
    timezone: plainText(tripPage.properties.Timezone) || "Asia/Tokyo",
    status: selectName(tripPage.properties.Status),
  };

  requireValue(trip.name, "Trips.Trip is required.", errors);
  requireValue(trip.slug, "Trips.Slug is required.", errors);
  requireValue(plainText(tripPage.properties.Timezone), "Trips.Timezone is required.", errors);
  try { new Intl.DateTimeFormat("en", { timeZone: trip.timezone }); }
  catch { errors.push("Trips.Timezone is invalid."); }
  Object.assign(trip, validatedPeriod(tripPeriod, trip.timezone, "Trips.Period", errors));
  requireValue(trip.start, "Trips.Period is required.", errors);

  const places = placePages.map((page) => ({
    id: normalizeId(page.id),
    name: plainText(page.properties.Place),
    latitude: numberValue(page.properties.Latitude),
    longitude: numberValue(page.properties.Longitude),
    address: plainText(page.properties.Address),
    mapsUrl: urlValue(page.properties["Maps URL"]),
    phone: phoneValue(page.properties.Phone),
    website: urlValue(page.properties.Website),
    notes: plainText(page.properties["Public Notes"]),
  }));
  const placesById = new Map(places.map((place) => [place.id, place]));

  const items = itemPages
    .filter((page) => page.properties.Publish?.checkbox !== false && relationIds(page.properties.Trip).includes(trip.id))
    .map((page) => {
      const period = validatedPeriod(dateValue(page.properties.Period), trip.timezone, `Itinerary item ${page.id}`, errors);
      const item = {
        id: normalizeId(page.id),
        structure: selectName(page.properties.Structure) ?? "Item",
        parentId: relationIds(page.properties.Parent)[0] ?? null,
        detourForId: relationIds(page.properties["Detour For"])[0] ?? null,
        rejoinPlaceId: relationIds(page.properties["Rejoin Place"])[0] ?? null,
        openingHours: plainText(page.properties["Opening Hours"]),
        additionalDurationMinutes: numberValue(page.properties["Additional Duration Minutes"]),
        title: plainText(page.properties.Item),
        start: period.start,
        end: period.end,
        order: numberValue(page.properties.Order) ?? 0,
        type: selectName(page.properties.Type) ?? "Activity",
        status: selectName(page.properties.Status),
        transport: selectName(page.properties.Transport),
        placeId: relationIds(page.properties.Place)[0] ?? null,
        fromId: relationIds(page.properties.From)[0] ?? null,
        toId: relationIds(page.properties.To)[0] ?? null,
        navigationUrl: urlValue(page.properties["Navigation URL"]),
        reservationUrl: urlValue(page.properties["Reservation URL"]),
        reservationStatus: selectName(page.properties["Reservation Status"]),
        durationMinutes: numberValue(page.properties["Duration Minutes"]),
        totalCost: numberValue(page.properties["Total Cost"]),
        perPersonCost: numberValue(page.properties["Per Person Cost"]),
        currency: selectName(page.properties.Currency),
        notes: plainText(page.properties["Public Notes"]),
      };

      requireValue(item.title, `Itinerary item ${page.id}: Item is required.`, errors);
      requireValue(["Item", "Alternative Group", "Series", "Flexible Block"].includes(item.structure), `${item.title}: invalid Structure.`, errors);
      requireValue(relationIds(page.properties.Parent).length <= 1 && !page.properties.Parent?.has_more, `${item.title}: multiple parents are forbidden.`, errors);
      requireValue(relationIds(page.properties.Trip).length === 1 && !page.properties.Trip?.has_more, `${item.title}: exactly one Trip is required.`, errors);
      for (const name of ["Detour For", "Rejoin Place"]) {
        const prop = page.properties[name];
        requireValue(!prop || ((!prop.type || prop.type === "relation") && Array.isArray(prop.relation) && prop.relation.length <= 1 && !prop.has_more), `${item.title}: ${name} must be a complete Relation with zero or one target.`, errors);
      }
      for (const [name, value] of [["Duration Minutes", item.durationMinutes], ["Additional Duration Minutes", item.additionalDurationMinutes]]) {
        requireValue(value === null || (Number.isFinite(value) && value >= 0), `${item.title}: ${name} must be finite and nonnegative.`, errors);
      }
      if (item.structure === "Flexible Block") requireValue(item.start && item.end, `${item.title}: Flexible Block Period start and end are required.`, errors);
      if (item.structure === "Item" && item.type === "Transit") {
        requireValue(item.fromId && placesById.has(item.fromId), `Transit ${item.title}: published From place is required.`, errors);
        requireValue(item.toId && placesById.has(item.toId), `Transit ${item.title}: published To place is required.`, errors);
      } else if (item.structure === "Item" && item.type !== "Note") {
        requireValue(item.placeId && placesById.has(item.placeId), `${item.title}: published Place is required.`, errors);
      }
      for (const id of [item.placeId, item.fromId, item.toId, item.rejoinPlaceId].filter(Boolean)) requireValue(placesById.has(id), `${item.title}: unpublished ${id === item.rejoinPlaceId ? "Rejoin Place" : "place"} reference.`, errors);
      return item;
    });

  const nodes = new Map(items.map((item) => [item.id, item]));
  const children = new Map(items.map((item) => [item.id, []]));
  for (const item of items) {
    if (!item.parentId) continue;
    const parent = nodes.get(item.parentId);
    requireValue(parent, `${item.title}: Parent must be published and belong to the same Trip (orphan reference).`, errors);
    if (!parent) continue;
    children.get(parent.id).push(item);
    const allowed = { "Alternative Group": ["Item", "Series", "Flexible Block"], Series: ["Item", "Flexible Block"], "Flexible Block": ["Item"] };
    requireValue(allowed[parent.structure]?.includes(item.structure), `${item.title}: forbidden nesting or Item parent.`, errors);
  }
  function ancestry(item) {
    const result = [], seen = new Set();
    while (item && !seen.has(item.id)) { result.push(item); seen.add(item.id); item = nodes.get(item.parentId); }
    return result;
  }
  for (const item of items) {
    const chain = ancestry(item), root = chain.at(-1), inDetour = !!root?.detourForId;
    if (item.detourForId) {
      const target = nodes.get(item.detourForId);
      requireValue(!item.parentId, `${item.title}: Detour For is only allowed on a root.`, errors);
      requireValue(target && target.id !== item.id && target.structure === "Item" && target.type === "Transit" && !ancestry(target).some(n => n.id === item.id), `${item.title}: Detour For must reference a published same Trip Transit Item, never self or descendants.`, errors);
      requireValue(Number.isFinite(item.additionalDurationMinutes) && item.additionalDurationMinutes >= 0, `${item.title}: Additional Duration Minutes is required for a detour.`, errors);
    }
    requireValue(!inDetour || item.structure !== "Flexible Block", `${item.title}: Flexible Block is forbidden in a detour.`, errors);
    if (item.structure === "Item" && !item.start) {
      requireValue(inDetour || nodes.get(item.parentId)?.structure === "Flexible Block", `${item.title}: Period is required.`, errors);
      if (inDetour) requireValue(Number.isFinite(item.durationMinutes) && item.durationMinutes >= 0, `${item.title}: Duration Minutes is required for an untimed detour Item.`, errors);
    }
  }
  const visiting = new Set(), visited = new Set();
  function boundary(value, end = false) {
    if (!value) return NaN;
    if (value.includes("T")) return Date.parse(value);
    const day = end ? new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10) : value;
    return Date.parse(normalizeDate(`${day}T00:00:00`, trip.timezone));
  }
  function validateContainer(item) {
    if (visiting.has(item.id)) { errors.push(`${item.title}: cycle in Parent relations.`); return; }
    if (visited.has(item.id)) return;
    visiting.add(item.id);
    const direct = children.get(item.id);
    direct.forEach(validateContainer);
    visiting.delete(item.id); visited.add(item.id);
    if (item.structure === "Item") return;
    requireValue(direct.length >= (item.structure === "Alternative Group" ? 2 : 1), `${item.title}: empty or insufficient published container children.`, errors);
    const starts = direct.map((child) => child.start).filter(Boolean).sort((a, b) => boundary(a) - boundary(b));
    const ends = direct.map((child) => child.end || child.start).filter(Boolean).sort((a, b) => boundary(a, true) - boundary(b, true));
    if (!item.start && item.structure !== "Flexible Block") { item.start = starts[0] || null; item.end = ends.at(-1) || null; }
    else requireValue(starts.every((start) => boundary(start) >= boundary(item.start)) && ends.every((end) => boundary(end, true) <= boundary(item.end || item.start, true)), `${item.title}: Period must contain all children.`, errors);
  }
  items.forEach(validateContainer);
  items.sort(compareItems);

  for (const place of places) {
    requireValue((place.latitude === null && place.longitude === null) || (Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180), `Place ${place.id}: invalid coordinates.`, errors);
  }

  if (errors.length) {
    throw new Error(`Notion data validation failed:\n- ${errors.join("\n- ")}`);
  }

  const referencedPlaceIds = new Set(items.flatMap((item) => [item.placeId, item.fromId, item.toId, item.rejoinPlaceId]).filter(Boolean));
  return {
    generatedAt,
    trip,
    places: places.filter((place) => referencedPlaceIds.has(place.id)),
    items,
  };
}

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionResponse(response) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion API ${response.status}: ${body}`);
  }
  return response.json();
}

export async function queryDataSource({ token, dataSourceId, filter, fetchImpl = fetch }) {
  const results = [];
  let startCursor;
  do {
    const response = await fetchImpl(`${NOTION_API_BASE}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        page_size: 100,
        ...(filter ? { filter } : {}),
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    });
    const page = await notionResponse(response);
    results.push(...page.results);
    startCursor = page.has_more ? page.next_cursor : undefined;
  } while (startCursor);
  return results;
}

export async function retrievePage({ token, pageId, fetchImpl = fetch }) {
  return notionResponse(await fetchImpl(`${NOTION_API_BASE}/pages/${pageId}`, {
    headers: notionHeaders(token),
  }));
}

export async function updatePage({ token, pageId, properties, fetchImpl = fetch }) {
  return notionResponse(await fetchImpl(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(token),
    body: JSON.stringify({ properties }),
  }));
}

export async function syncTripFromNotion({
  token,
  tripSlug,
  tripsDataSourceId,
  placesDataSourceId,
  itemsDataSourceId,
  fetchImpl = fetch,
}) {
  const publishFilter = { property: "Publish", checkbox: { equals: true } };
  const [tripPages, placePages, itemPages] = await Promise.all([
    queryDataSource({ token, dataSourceId: tripsDataSourceId, filter: publishFilter, fetchImpl }),
    queryDataSource({ token, dataSourceId: placesDataSourceId, filter: publishFilter, fetchImpl }),
    queryDataSource({ token, dataSourceId: itemsDataSourceId, filter: publishFilter, fetchImpl }),
  ]);
  const tripPage = tripPages.find((page) => plainText(page.properties.Slug) === tripSlug);
  if (!tripPage) throw new Error(`Published trip with Slug "${tripSlug}" was not found.`);
  return publicTripPayload(buildTripPayload({ tripPage, placePages, itemPages }));
}

export async function publicTripPayload(payload) {
  if (!payload.trip.id) return payload;
  const tripSlug = payload.trip.slug;
  // Keep Notion relation IDs inside the sync boundary. UI IDs remain stable but
  // cannot be used to construct internal Notion page URLs.
  const publicId = async (id) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tripSlug}:${id}`));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  const ids = new Map(await Promise.all([...payload.places, ...payload.items].map(async ({ id }) => [id, await publicId(id)])));
  const { id: _internalId, ...trip } = payload.trip;
  return {
    ...payload, trip,
    places: payload.places.map((place) => ({ ...place, id: ids.get(place.id), mapsUrl: urlValue({ url: place.mapsUrl }), website: urlValue({ url: place.website }) })),
    items: payload.items.map((item) => ({ ...item, structure: item.structure || "Item", parentId: ids.get(item.parentId) || null, detourForId: ids.get(item.detourForId) || null, rejoinPlaceId: ids.get(item.rejoinPlaceId) || null, id: ids.get(item.id), placeId: ids.get(item.placeId) || null, fromId: ids.get(item.fromId) || null, toId: ids.get(item.toId) || null, navigationUrl: urlValue({ url: item.navigationUrl }), reservationUrl: urlValue({ url: item.reservationUrl }) })),
  };
}
