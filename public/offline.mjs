// Public API fields only. Never serialize UI state or geolocation.
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const DB_NAME = "travel-itinerary-offline-v1";
const tripFields = "name slug start end timezone status".split(" ");
const placeFields = "id name latitude longitude address mapsUrl phone website notes".split(" ");
const itemFields = "id structure parentId detourForId rejoinPlaceId openingHours additionalDurationMinutes title start end order type status transport placeId fromId toId navigationUrl reservationUrl reservationStatus durationMinutes totalCost perPersonCost currency notes".split(" ");
const numericFields = new Set("latitude longitude additionalDurationMinutes order durationMinutes totalCost perPersonCost".split(" "));
const pick = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => {
  const field = value[key];
  if (field !== null && typeof field !== (numericFields.has(key) ? "number" : "string")) throw new Error("invalid field");
  if (typeof field === "number" && !Number.isFinite(field)) throw new Error("invalid number");
  return [key, field];
}));
export function publicSnapshot(value) {
  if (!value || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) || !value.trip || !Array.isArray(value.places) || !Array.isArray(value.items)) throw new Error("invalid snapshot");
  const trip = pick(value.trip, tripFields);
  if (!trip.slug || typeof trip.slug !== "string" || !trip.name || !trip.timezone) throw new Error("invalid trip");
  new Intl.DateTimeFormat("ja", { timeZone: trip.timezone });
  for (const date of [trip.start, trip.end]) if (date && !Number.isFinite(Date.parse(date))) throw new Error("invalid date");
  const places = value.places.map(place => pick(place, placeFields));
  const items = value.items.map(item => pick(item, itemFields));
  for (const [list, title] of [[places, "name"], [items, "title"]]) {
    if (new Set(list.map(row => row.id)).size !== list.length || list.some(row => typeof row.id !== "string" || !row.id || typeof row[title] !== "string")) throw new Error("invalid rows");
  }
  const placeIds = new Set(places.map(p => p.id)), itemIds = new Set(items.map(i => i.id));
  for (const item of items) {
    for (const name of ["placeId", "fromId", "toId", "rejoinPlaceId"]) if (item[name] && !placeIds.has(item[name])) throw new Error("invalid reference");
    for (const name of ["parentId", "detourForId"]) if (item[name] && !itemIds.has(item[name])) throw new Error("invalid reference");
    for (const name of ["start", "end"]) if (item[name] && !Number.isFinite(Date.parse(item[name]))) throw new Error("invalid date");
    const seen = new Set([item.id]); let parent = item.parentId;
    while (parent) { if (seen.has(parent)) throw new Error("cycle"); seen.add(parent); parent = items.find(i => i.id === parent)?.parentId; }
  }
  return { generatedAt: value.generatedAt, trip, places, items };
}
export function expireRecord(record, now = Date.now()) {
  if (!record || record.schema !== 1 || !Number.isFinite(record.firstSavedAt) || record.expiresAt !== record.firstSavedAt + RETENTION_MS || !Number.isFinite(Date.parse(record.generatedAt))) return null;
  if (now >= record.expiresAt) { const { payload: _payload, ...metadata } = record; return metadata; }
  return record;
}
export function nextRecord(previous, input, origin, now = Date.now(), cache = "hit") {
  const payload = publicSnapshot(input), key = `${origin}|${payload.trip.slug}`;
  previous = expireRecord(previous, now);
  if (["stale", "throttled"].includes(cache)) return previous;
  if (previous?.key === key && Date.parse(payload.generatedAt) <= Date.parse(previous.generatedAt)) return previous;
  return { schema: 1, key, slug: payload.trip.slug, generatedAt: payload.generatedAt, firstSavedAt: now, expiresAt: now + RETENTION_MS, payload };
}
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("端末の保存領域を利用できません。"));
    request.onblocked = () => reject(new Error("他のタブを閉じて再試行してください。"));
  });
}
export async function storageAvailable() {
  if (!globalThis.indexedDB) return false;
  if (indexedDB.databases) return (await indexedDB.databases()).some(db => db.name === DB_NAME);
  return true;
}
async function transaction(change) {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"), request = store.get("active"); let result;
    request.onsuccess = () => { try { result = change(request.result || null); result ? store.put(result, "active") : store.delete("active"); } catch (error) { tx.abort(); reject(error); } };
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(new Error("保存できませんでした。容量・ブラウザ設定を確認してください。"));
  }); } finally { db.close(); }
}
export async function readSaved(origin) {
  if (!await storageAvailable()) return null;
  return transaction(value => {
    const record = expireRecord(value);
    if (!record || record.key !== `${origin}|${record.slug}`) return null;
    try { if (record.payload) { record.payload = publicSnapshot(record.payload); if (record.payload.trip.slug !== record.slug || record.payload.generatedAt !== record.generatedAt) return null; } } catch { return null; }
    return record;
  });
}
export const savePublic = (input, origin, cache, enable = false) => transaction(previous => {
  if (!enable && !previous) return null;
  return nextRecord(previous, input, origin, Date.now(), cache);
});
export async function deleteSaved() {
  if (!await storageAvailable()) return;
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = resolve; request.onerror = request.onblocked = () => reject(new Error("他のタブを閉じて削除を再試行してください。")); });
}
