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
  if (!value) return "時刻未定";
  if (!value.includes("T")) return "終日";
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
export function compareUntimed(a, b) {
  return (a.order || 0) - (b.order || 0) || compareCandidates({ ...a, start: null }, { ...b, start: null });
}

export function buildTree(items) {
  const byId = new Map(items.map((item) => [item.id, { ...item, structure: structureOf(item), children: [], detours: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = byId.get(node.parentId);
    if (parent) parent.children.push(node);
    else if (node.detourForId && byId.has(node.detourForId)) byId.get(node.detourForId).detours.push(node);
    else roots.push(node);
  }
  for (const node of byId.values()) {
    let root = node; const seen = new Set();
    while (root.parentId && !seen.has(root.id)) { seen.add(root.id); root = byId.get(root.parentId) || root; }
    node.children.sort(node.structure === "Flexible Block" || root.detourForId ? compareUntimed : node.structure === "Alternative Group" ? compareCandidates : compareItems);
    node.detours.sort(compareUntimed);
  }
  roots.sort(compareItems);
  return { roots, byId };
}
export function flattenTree(roots) { return roots.flatMap((node) => [node, ...flattenTree(node.children), ...flattenTree(node.detours || [])]); }
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
  function visit(node, inherited = false, timeContext = null) {
    if (!filters.showCancelled && ["Cancelled", "中止"].includes(node.status)) return null;
    if (!onDay(timeContext || node, day, timeZone)) return null;
    const match = inherited || matchesFilters(node, filters, selectedIds);
    const context = timeContext || (node.structure === "Flexible Block" ? node : null);
    const children = node.children.map((child) => visit(child, match, context)).filter(Boolean);
    const detours = (node.detours || []).map((detour) => visit(detour, false, node)).filter(Boolean);
    return match || children.length || detours.length ? { ...node, children, detours } : null;
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
  const end = Math.max(...timed.map((node) => minuteInDay(node.end || node.start, day, timeZone) + (!node.end || node.end === node.start ? 15 : 0)));
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
export function mapNodes(roots, activeCandidates, range, day, timeZone, places, state = {}) {
  function visit(node, timeContext = null) {
    if (!overlapsRange(timeContext || node, range, day, timeZone)) return [];
    const detours = (node.detours || []).filter(detour => flattenTree([detour]).some(n => state.expandedItemIds?.has(n.id) || state.focusedItemId === n.id || state.selectedIds?.has(n.id))).flatMap(n => visit(n, node));
    if (structureOf(node) === "Item") return [node, ...detours];
    const children = node.structure === "Alternative Group" ? [node.children.find((child) => child.id === activeCandidates.get(node.id)) || node.children[0]].filter(Boolean) : node.children;
    const result = children.flatMap(child => visit(child, timeContext || (node.structure === "Flexible Block" ? node : null)));
    return [...(result.some((item) => itemPlaces(item, places).some(hasCoordinates)) ? result : itemPlaces(node, places).some(hasCoordinates) ? [node] : result), ...detours];
  }
  return roots.flatMap(node => visit(node));
}

// Use the complete public tree, never a filter projection. A Transit inside an
// alternative stays in its own branch when finding the next scheduled stop.
export function detourAssessment(detour, transit, tree, activeCandidates = new Map()) {
  const branches = new Map(activeCandidates);
  let branch = transit;
  while (branch?.parentId) {
    const parent = tree.byId.get(branch.parentId);
    if (parent?.structure === "Alternative Group") branches.set(parent.id, branch.id);
    branch = parent;
  }
  function scheduled(node) {
    if (node.status === "Cancelled") return [];
    if (node.structure === "Alternative Group") return scheduled(node.children.find(c => c.id === branches.get(node.id)) || node.children[0] || { children: [] });
    if (node.structure === "Series") return node.children.flatMap(scheduled);
    return node.start?.includes("T") ? [node] : [];
  }
  const end = Date.parse(transit.end);
  const next = tree.roots.flatMap(scheduled).filter(n => n.id !== transit.id && Date.parse(n.start) >= end).sort(compareItems)[0];
  if (!Number.isFinite(end) || !next) return { minutes: null, text: "次の予定がないため判定不可" };
  const minutes = Number(((Date.parse(next.start) - end) / 60000 - detour.additionalDurationMinutes).toFixed(3));
  return { minutes, nextId: next.id, text: minutes >= 0 ? `寄り道可能・${minutes}分余裕` : `予定超過・${Math.abs(minutes)}分` };
}

export function resolveDestination(node, places, focusedId = null, activeCandidates = new Map()) {
  if (!node) return null;
  if (structureOf(node) === "Alternative Group") return resolveDestination(node.children.find(c => c.id === activeCandidates.get(node.id)) || node.children[0], places, focusedId, activeCandidates);
  if (structureOf(node) === "Series") {
    const focused = flattenTree(node.children).find(n => n.id === focusedId);
    return (focused && resolveDestination(focused, places, null, activeCandidates)) || node.children.map(n => resolveDestination(n, places, null, activeCandidates)).find(Boolean) || null;
  }
  if (structureOf(node) !== "Item") return null;
  const place = places.get(node.type === "Transit" ? node.toId : node.placeId);
  return place && (hasCoordinates(place) || place.address) ? { place, item: node } : null;
}
export function buildDirectionsUrl(location, destination) {
  if (!hasCoordinates(location) || !destination?.place) return null;
  return directionsUrl(location, destination.place, destination.item.transport);
}
export function routeEndpoint(place) {
  return hasCoordinates(place) ? `${place.latitude},${place.longitude}` : typeof place?.address === "string" ? place.address.trim() : null;
}
export function resolvePlannedRoute(item, places) {
  if (!item || structureOf(item) !== "Item" || item.type !== "Transit") return { reason: "予定区間は個々の移動項目で確認できます。" };
  const from = places.get(item.fromId), to = places.get(item.toId);
  if (!routeEndpoint(from)) return { reason: "出発地の座標・公開住所がありません。" };
  if (!routeEndpoint(to)) return { reason: "到着地の座標・公開住所がありません。" };
  const url = directionsUrl(from, to, item.transport);
  return url ? { from, to, url } : { reason: "経路URLが2048文字を超えます。短い住所や座標を登録してください。" };
}
export function directionsUrl(from, to, transport) {
  const origin = routeEndpoint(from), target = routeEndpoint(to);
  if (!origin || !target) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1"); url.searchParams.set("origin", origin); url.searchParams.set("destination", target);
  const mode = { Walk: "walking", Train: "transit", Bus: "transit", Car: "driving" }[transport];
  if (mode) url.searchParams.set("travelmode", mode);
  return url.href.length <= 2048 ? url.href : null;
}
export function locationIsStale(location, now = Date.now()) { return !location || now - location.timestamp > 300000; }
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
