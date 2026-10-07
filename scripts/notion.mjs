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
  return property?.url ?? null;
}

function phoneValue(property) {
  return property?.phone_number ?? null;
}

function requireValue(condition, message, errors) {
  if (!condition) errors.push(message);
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
    .filter((page) => relationIds(page.properties.Trip).includes(trip.id))
    .map((page) => {
      const period = dateValue(page.properties.Period);
      const item = {
        id: normalizeId(page.id),
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
        notes: plainText(page.properties["Public Notes"]),
      };

      requireValue(item.title, `Itinerary item ${page.id}: Item is required.`, errors);
      requireValue(item.start, `Itinerary item ${item.title || page.id}: Period is required.`, errors);
      if (item.type === "Transit") {
        requireValue(item.fromId && placesById.has(item.fromId), `Transit ${item.title}: published From place is required.`, errors);
        requireValue(item.toId && placesById.has(item.toId), `Transit ${item.title}: published To place is required.`, errors);
      } else if (item.type !== "Note") {
        requireValue(item.placeId && placesById.has(item.placeId), `${item.title}: published Place is required.`, errors);
      }
      return item;
    })
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || a.order - b.order || a.title.localeCompare(b.title));

  if (errors.length) {
    throw new Error(`Notion data validation failed:\n- ${errors.join("\n- ")}`);
  }

  const referencedPlaceIds = new Set(items.flatMap((item) => [item.placeId, item.fromId, item.toId]).filter(Boolean));
  return {
    generatedAt,
    trip,
    places: places.filter((place) => referencedPlaceIds.has(place.id)),
    items,
  };
}

export async function queryDataSource({ token, dataSourceId, filter }) {
  const results = [];
  let startCursor;
  do {
    const response = await fetch(`${NOTION_API_BASE}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        ...(filter ? { filter } : {}),
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion API ${response.status}: ${body}`);
    }
    const page = await response.json();
    results.push(...page.results);
    startCursor = page.has_more ? page.next_cursor : undefined;
  } while (startCursor);
  return results;
}
