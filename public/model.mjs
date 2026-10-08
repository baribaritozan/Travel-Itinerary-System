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

export const structureOf = (node) => node.structure || "Item";
export function compareCandidates(a, b) {
  const ranks = { Confirmed: 0, Tentative: 1, Candidate: 2, Cancelled: 3 };
  return (ranks[a.status] ?? 2) - (ranks[b.status] ?? 2) || (a.order || 0) - (b.order || 0) || compareItems(a, b);
}

export function buildTree(items) {
  const byId = new Map(items.map((item) => [item.id, { ...item, structure: structureOf(item), children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = byId.get(node.parentId);
    if (parent) parent.children.push(node); else roots.push(node);
  }
  for (const node of byId.values()) node.children.sort(node.structure === "Alternative Group" ? compareCandidates : compareItems);
  roots.sort(compareItems);
  return { roots, byId };
}
export function flattenTree(roots) { return roots.flatMap((node) => [node, ...flattenTree(node.children)]); }
export function descendantItems(node) {
  return structureOf(node) === "Item" ? [node] : node.children.flatMap(descendantItems);
}
export function selectionState(node, selectedIds) {
  const leaves = descendantItems(node), count = leaves.filter((leaf) => selectedIds.has(leaf.id)).length;
  return count === 0 ? "false" : count === leaves.length ? "true" : "mixed";
}
export function toggleSelection(node, selectedIds) {
  const next = new Set(selectedIds), remove = selectionState(node, selectedIds) === "true";
  for (const leaf of descendantItems(node)) remove ? next.delete(leaf.id) : next.add(leaf.id);
  return next;
}
export function pruneState(state, items) {
  const tree = buildTree(items), ids = new Set(items.map((item) => item.id));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => ids.has(id) && structureOf(tree.byId.get(id)) === "Item"));
  state.expandedItemIds = new Set([...state.expandedItemIds].filter((id) => ids.has(id)));
  if (!ids.has(state.focusedItemId)) state.focusedItemId = null;
  for (const [id, candidate] of state.activeCandidateByGroup) {
    const group = tree.byId.get(id);
    if (!group || !group.children.some((child) => child.id === candidate)) state.activeCandidateByGroup.delete(id);
  }
  return tree;
}
export function defaultFilters() { return { type: [], status: [], reservationStatus: [], transport: [], selectedOnly: false, showCancelled: false }; }
export function filtersActive(filters) { return filters.selectedOnly || filters.showCancelled || ["type", "status", "reservationStatus", "transport"].some((key) => filters[key].length); }
export function matchesFilters(node, filters, selectedIds) {
  return (!filters.selectedOnly || selectedIds.has(node.id)) && ["type", "status", "reservationStatus", "transport"].every((key) => !filters[key].length || filters[key].includes(node[key]));
}
export function onDay(node, day, timeZone) {
  const start = dayInZone(node.start, timeZone), end = dayInZone(node.end, timeZone) || start;
  return structureOf(node) === "Item" ? start === day : start <= day && day <= end;
}
export function filterTree(roots, filters, selectedIds, day, timeZone) {
  function visit(node, inherited = false) {
    if (!filters.showCancelled && ["Cancelled", "中止"].includes(node.status)) return null;
    if (!onDay(node, day, timeZone)) return null;
    const match = inherited || matchesFilters(node, filters, selectedIds);
    const children = node.children.map((child) => visit(child, match)).filter(Boolean);
    return match || children.length ? { ...node, children } : null;
  }
  return roots.map((node) => visit(node)).filter(Boolean);
}
export function minuteInDay(value, day, timeZone) {
  const date = dayInZone(value, timeZone);
  if (date < day) return 0;
  if (date > day) return 1440;
  if (!value?.includes("T")) return 0;
  const [hours, minutes] = formatTime(value, timeZone).split(":").map(Number);
  return hours * 60 + minutes;
}
export function initialTimeRange(nodes, day, timeZone) {
  const timed = nodes.filter((node) => node.start?.includes("T"));
  if (!timed.length) return { start: 0, end: 1440 };
  const start = Math.min(...timed.map((node) => minuteInDay(node.start, day, timeZone)));
  const end = Math.max(...timed.map((node) => minuteInDay(node.end || node.start, day, timeZone)));
  const roundedStart = Math.min(1425, Math.floor(start / 15) * 15);
  return { start: roundedStart, end: Math.min(1440, Math.max(roundedStart + 15, Math.ceil(end / 15) * 15)) };
}
export function overlapsRange(node, range, day, timeZone) {
  if (!node.start?.includes("T")) return true;
  const start = minuteInDay(node.start, day, timeZone);
  if (!node.end || node.end === node.start) return start >= range.start && start < range.end;
  return start < range.end && minuteInDay(node.end, day, timeZone) > range.start;
}
export function shiftTimeRange(range, direction) {
  const width = range.end - range.start, start = Math.max(0, Math.min(1440 - width, range.start + direction * width));
  return { start, end: start + width };
}
export function minuteLabel(minute) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }

// A container's own location is a fallback only when displayed descendants
// have no geographic data. Alternative groups contribute one active branch.
export function mapNodes(roots, activeCandidates, range, day, timeZone, places) {
  function visit(node) {
    if (!overlapsRange(node, range, day, timeZone)) return [];
    if (structureOf(node) === "Item") return [node];
    const children = node.structure === "Alternative Group" ? [node.children.find((child) => child.id === activeCandidates.get(node.id)) || node.children[0]].filter(Boolean) : node.children;
    const result = children.flatMap(visit);
    return result.some((item) => itemPlaces(item, places).some(hasCoordinates)) ? result : itemPlaces(node, places).some(hasCoordinates) ? [node] : result;
  }
  return roots.flatMap(visit);
}
export function focusedMapIds(id, roots, activeCandidates) {
  const node = flattenTree(roots).find((node) => node.id === id);
  if (!node) return new Set();
  const ids = new Set([node.id]);
  function visit(value) {
    ids.add(value.id);
    const children = value.structure === "Alternative Group" ? [value.children.find((child) => child.id === activeCandidates.get(value.id)) || value.children[0]].filter(Boolean) : value.children;
    children.forEach(visit);
  }
  visit(node); return ids;
}
