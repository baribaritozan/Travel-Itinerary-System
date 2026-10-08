// Date-only values are calendar dates; timestamps are instants in the trip zone.
export function dayInZone(value, timeZone) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key).value).join("-");
}

export function tripDays(trip, items) {
  const days = new Set(items.map((item) => dayInZone(item.start, trip.timezone)).filter(Boolean));
  const start = dayInZone(trip.start, trip.timezone);
  const end = dayInZone(trip.end, trip.timezone) || start;
  if (start && end && start <= end) {
    for (let day = start; day <= end;) {
      days.add(day);
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    }
  }
  return [...days].sort();
}

export function chooseInitialDay(days, timeZone, now = new Date()) {
  const today = dayInZone(now.toISOString(), timeZone);
  return days.reduce((best, day) => Math.abs(Date.parse(day) - Date.parse(today)) < Math.abs(Date.parse(best) - Date.parse(today)) ? day : best, days[0] || today);
}

export function compareItems(a, b) {
  return Date.parse(a.start) - Date.parse(b.start) || (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title, "ja");
}

export function formatDay(day) {
  // UTC here formats a calendar label, never selects an itinerary day.
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

export function formatTime(value, timeZone) {
  if (!value || !value.includes("T")) return "終日";
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(value));
}

export function formatDateTime(value, timeZone) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function hasCoordinates(place) {
  return Number.isFinite(place?.latitude) && Math.abs(place.latitude) <= 90 && Number.isFinite(place?.longitude) && Math.abs(place.longitude) <= 180;
}

export function itemPlaces(item, places) {
  return (item.type === "Transit" ? [item.fromId, item.toId] : [item.placeId]).map((id) => places.get(id)).filter(Boolean);
}

export function buildMapsUrl(item, places) {
  const explicit = safeUrl(item.navigationUrl);
  if (explicit) return explicit;
  const from = places.get(item.fromId), to = places.get(item.toId), place = places.get(item.placeId);
  if (hasCoordinates(from) && hasCoordinates(to)) return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${from.latitude},${from.longitude}`)}&destination=${encodeURIComponent(`${to.latitude},${to.longitude}`)}`;
  if (safeUrl(place?.mapsUrl)) return safeUrl(place.mapsUrl);
  if (hasCoordinates(place)) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`;
  if (place?.address || place?.name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || place.name)}`;
  return null;
}

export function nearestItem(cards, spot) {
  return cards.reduce((nearest, card) => {
    const rect = card.getBoundingClientRect();
    const distance = spot < rect.top ? rect.top - spot : spot > rect.bottom ? spot - rect.bottom : 0;
    return !nearest || distance < nearest.distance ? { id: card.dataset.id, distance } : nearest;
  }, null)?.id;
}
