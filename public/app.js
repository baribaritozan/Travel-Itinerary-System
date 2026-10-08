import { dayInZone, tripDays, chooseInitialDay, compareItems, formatDay, formatTime, formatDateTime, escapeHtml as esc, safeUrl, hasCoordinates, itemPlaces, buildMapsUrl, nearestItem } from "./model.mjs";
import { structureOf, pruneState, flattenTree, selectionState, toggleSelection, defaultFilters, filtersActive, filterTree, initialTimeRange, shiftTimeRange, minuteLabel, mapNodes, focusedMapIds, descendantItems } from "./model.mjs";

const app = document.querySelector("#app");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = () => matchMedia("(max-width: 850px)").matches;
const labels = { Transit: "移動", Activity: "活動", Sightseeing: "観光", Meal: "食事", Stay: "宿泊", Meeting: "集合", Note: "メモ", Confirmed: "確定", Tentative: "暫定", Candidate: "候補", Cancelled: "中止", Walk: "徒歩", Train: "電車", Bus: "バス", Car: "車", Ferry: "フェリー", Required: "予約必要", Pending: "手配中", Booked: "予約完了", Completed: "予約完了", "Not Required": "予約不要" };
const label = (value) => labels[value] || value;
// Focus, details, comparison and map time have independent state owners.
const state = { selectedDay: null, focusedItemId: null, expandedItemIds: new Set(), mapPanelMode: "standard", focusSource: null, selectedIds: new Set(), activeCandidateByGroup: new Map(), filters: defaultFilters(), mapTimeRange: null };
let data, places, days, visibleItems = [], map, layerGroup;
let tree, visibleRoots = [], geographicItems = [];
let itemLayers = new Map(), markers = [], bounds = [];
let scrollTimer, programmaticScroll = false, cooldownUntil = 0, refreshing = false, needsFit = false;
let suppressScrollFocus = false;
let timeline, itemsElement, mapPanel, statusElement, publishButton;

function link(url, text) {
  const safe = safeUrl(url);
  return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : "";
}

function setupShell() {
  app.className = "shell";
  app.innerHTML = `<section class="timeline-panel" aria-label="旅程">
    <header><div class="eyebrow">Travel itinerary</div><h1></h1><p class="meta"></p>
    <div class="sync-row"><p class="sync"></p><button class="publish-button" type="button">Notionから再取得</button></div>
    <p class="publish-status" role="status" aria-live="polite"></p></header>
    <nav class="days" aria-label="日付"></nav>
    <details class="filter-panel"><summary>予定を絞り込む</summary><div class="filter-fields"></div>
      <button type="button" class="reservation-shortcut" aria-pressed="false">予約が必要だが未完了</button>
      <label class="check-label"><input type="checkbox" class="selected-only">選択項目のみ表示</label>
      <label class="check-label"><input type="checkbox" class="show-cancelled">中止を表示</label>
      <button type="button" class="clear-filters">フィルターを全解除</button></details>
    <p class="comparison-status" role="status" aria-live="polite"></p><p class="focus-status" role="status" aria-live="polite"></p>
    <details class="time-panel"><summary>地図の時間範囲 <span class="time-summary"></span></summary>
      <label>開始 <output class="time-start-label"></output><input class="time-start" type="range" min="0" max="1425" step="15" aria-label="地図の開始時刻"></label>
      <label>終了 <output class="time-end-label"></output><input class="time-end" type="range" min="15" max="1440" step="15" aria-label="地図の終了時刻"></label>
      <div class="time-actions"><button type="button" class="time-prev">時間範囲を前へ</button><button type="button" class="time-next">時間範囲を次へ</button><button type="button" class="time-reset">時間範囲を初期化</button></div>
      <p class="time-status" role="status" aria-live="polite"></p></details>
    <div class="timeline-tools"><span>● 地点　○ 活動</span><button class="collapse-all" type="button">すべて閉じる</button></div>
    <button type="button" class="clear-selection">選択をすべて解除</button>
    <p class="timeline-key">実線：地点間の移動 · 破線：同じ場所の時間進行</p>
    <div class="items" aria-label="選択日の予定"></div></section>
    <section class="map-panel" aria-label="旅程の地図" data-mode="standard">
      <div class="map-heading"><h2>旅程の地図</h2><p class="map-legend">破線は概略線（実際の道路・鉄道経路ではありません）</p><p class="compact-note" hidden>表示領域が小さいため地図を最小表示中です。「拡大」で確認できます。</p></div>
      <p class="map-status" role="status" aria-live="polite">地図を読み込んでいます…</p>
      <div id="map" aria-label="地点と移動の概略線"></div>
      <div class="map-controls" aria-label="地図表示">
        <div class="panel-modes" aria-label="地図パネルの大きさ">
          <button type="button" data-mode="minimal" aria-pressed="false">最小</button>
          <button type="button" data-mode="standard" aria-pressed="true">標準</button>
          <button type="button" data-mode="expanded" aria-pressed="false">拡大</button>
        </div><button type="button" class="show-all" disabled>全体を表示</button>
      </div></section>`;
  timeline = app.querySelector(".timeline-panel"); itemsElement = app.querySelector(".items");
  mapPanel = app.querySelector(".map-panel"); statusElement = app.querySelector(".publish-status");
  publishButton = app.querySelector(".publish-button");
  publishButton.addEventListener("click", refresh);
  setupComparisonControls();
  app.querySelector(".collapse-all").addEventListener("click", () => {
    state.expandedItemIds.clear();
    itemsElement.querySelectorAll(".details-toggle").forEach((button) => setExpanded(button, false));
  });
  mapPanel.querySelectorAll(".panel-modes button").forEach((button) => button.addEventListener("click", () => setMapMode(button.dataset.mode)));
  app.querySelector(".show-all").addEventListener("click", fitDay);
  timeline.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (programmaticScroll) { programmaticScroll = false; return; }
      if (suppressScrollFocus) return;
      const rect = timeline.getBoundingClientRect();
      const cards = [...itemsElement.querySelectorAll(".item")].filter(cardIsDisplayed).sort((a, b) => a.querySelectorAll(".item").length - b.querySelectorAll(".item").length);
      const id = nearestItem(cards, rect.top + rect.height * (mobile() ? .35 : .5));
      if (id) focusItem(id, "scroll");
    }, 160);
  }, { passive: true });
  for (const event of ["pointerdown", "focusin"]) timeline.addEventListener(event, (event) => {
    if (event.target.closest(".filter-panel, .time-panel, .publish-button, .select-toggle, .activate-candidate, .candidate-controls, .clear-selection")) { suppressScrollFocus = true; clearTimeout(scrollTimer); }
  });
  for (const event of ["wheel", "touchmove"]) timeline.addEventListener(event, (event) => { if (event.target.closest(".group-candidates") && event.type === "touchmove") return; programmaticScroll = false; suppressScrollFocus = false; }, { passive: true });
  timeline.addEventListener("keydown", (event) => {
    if (["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && !event.target.closest("input, .group-candidates")) { programmaticScroll = false; suppressScrollFocus = false; }
  });
  window.addEventListener("resize", () => {
    timeline.inert = mobile() && state.mapPanelMode === "expanded";
    updateCompactMap();
    map?.invalidateSize({ pan: false });
  });
  const resizeObserver = new ResizeObserver(updateCompactMap);
  resizeObserver.observe(mapPanel.querySelector(".map-controls"));
  mapPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setMapMode("standard"); app.querySelector('button[data-mode="expanded"]').focus(); }
  });
}

function updateCompactMap() {
  app.dataset.largeText = String(parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24);
  const compact = mobile() && state.mapPanelMode === "standard" && (parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24 || (window.visualViewport?.height || innerHeight) <= 600);
  mapPanel.dataset.compact = String(compact);
  mapPanel.querySelector(".compact-note").hidden = !compact;
}

function setMapMode(mode) {
  state.mapPanelMode = mode; mapPanel.dataset.mode = mode;
  timeline.inert = mobile() && mode === "expanded";
  updateCompactMap();
  mapPanel.querySelectorAll(".panel-modes button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  requestAnimationFrame(() => { map?.invalidateSize({ pan: false }); if (needsFit) fitDay(); });
}

function updateData(next) {
  data = next; places = new Map(data.places.map((place) => [place.id, place])); days = tripDays(data.trip, data.items);
  const previousDay = state.selectedDay;
  state.selectedDay = days.includes(state.selectedDay) ? state.selectedDay : chooseInitialDay(days, data.trip.timezone);
  if (state.selectedDay !== previousDay) state.mapTimeRange = null;
  tree = pruneState(state, data.items);
  app.dataset.comparison = String(data.items.some((item) => structureOf(item) !== "Item"));
  renderFilterFields();
  document.title = data.trip.name; app.querySelector("h1").textContent = data.trip.name;
  app.querySelector(".meta").textContent = `${data.trip.start ? formatDay(dayInZone(data.trip.start, data.trip.timezone)) : "日程未設定"}${data.trip.end ? ` – ${formatDay(dayInZone(data.trip.end, data.trip.timezone))}` : ""} · ${data.trip.timezone}`;
  app.querySelector(".sync").textContent = `最終同期 ${formatDateTime(data.generatedAt, data.trip.timezone)}`;
  renderDays(); renderItems(); app.setAttribute("aria-busy", "false");
}

function renderDays() {
  const nav = app.querySelector(".days");
  nav.innerHTML = days.map((day, index) => `<button class="day-button" type="button" data-day="${esc(day)}" aria-pressed="${day === state.selectedDay}">Day ${index + 1} · ${esc(formatDay(day))}</button>`).join("");
  nav.querySelectorAll("button").forEach((button, index) => {
    button.addEventListener("click", () => selectDay(button.dataset.day));
    button.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % days.length : event.key === "ArrowLeft" ? (index + days.length - 1) % days.length : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); selectDay(days[next]); nav.querySelectorAll("button")[next].focus();
    });
  });
}

function selectDay(day) {
  if (day === state.selectedDay) return;
  state.selectedDay = day; state.focusedItemId = null; clearTimeout(scrollTimer);
  state.mapTimeRange = null;
  renderDays(); renderItems(); programmaticScroll = true; timeline.scrollTop = 0;
  setTimeout(() => { programmaticScroll = false; }, 200);
  app.querySelector(`[data-day="${CSS.escape(day)}"]`).focus({ preventScroll: true });
}

function cost(value, currency) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat("ja-JP").format(value)}${currency ? ` ${esc(currency)}` : "（通貨未指定）"}` : "";
}

function details(item) {
  const locationDetails = itemPlaces(item, places).map((place, index) => `<section class="place-details"><h3>${item.type === "Transit" ? (index === 0 ? "出発地：" : "到着地：") : "場所："}${esc(place.name)}</h3>
    ${place.address ? `<p>${esc(place.address)}</p>` : ""}${place.notes ? `<p class="notes">${esc(place.notes)}</p>` : ""}
    <div class="actions">${link(place.website, "施設のWebサイト")}${link(place.mapsUrl, "場所の地図")}${place.phone && /^[+\d()\s-]+$/.test(place.phone) ? `<a href="tel:${esc(place.phone.replace(/[^+\d]/g, ""))}">電話 ${esc(place.phone)}</a>` : ""}</div></section>`).join("");
  return `${locationDetails}${item.notes ? `<p class="notes">${esc(item.notes)}</p>` : ""}
    ${Number.isFinite(item.totalCost) ? `<p>全体費用：${cost(item.totalCost, item.currency)}</p>` : ""}${Number.isFinite(item.perPersonCost) ? `<p>1人あたり：${cost(item.perPersonCost, item.currency)}</p>` : ""}
    <div class="actions">${link(buildMapsUrl(item, places), "地図・経路を開く")}${link(item.reservationUrl, "予約を開く")}</div>${!locationDetails && !item.notes && !buildMapsUrl(item, places) && !safeUrl(item.reservationUrl) ? "<p>追加情報はありません。</p>" : ""}`;
}

function cardHtml(item, index, siblings, nested = false) {
    const expanded = state.expandedItemIds.has(item.id), next = siblings[index + 1];
    const at = item.type === "Transit" ? item.fromId : item.placeId;
    const connection = next && at && at === (next.type === "Transit" ? next.fromId : next.placeId) ? "same-place" : "moving";
    const point = ["Sightseeing", "Stay", "Meeting", "Place", "観光", "宿泊", "集合"].includes(item.type);
    const time = formatTime(item.start, data.trip.timezone);
    const end = item.end ? ` – ${formatTime(item.end, data.trip.timezone)}` : item.durationMinutes ? ` · ${esc(item.durationMinutes)}分` : "";
    const missing = itemPlaces(item, places).filter(hasCoordinates).length < (item.type === "Transit" ? 2 : 1);
    const container = structureOf(item) !== "Item";
    const selection = selectionState(tree.byId.get(item.id), state.selectedIds);
    const children = item.structure === "Alternative Group" ? candidateHtml(item) : item.structure === "Series" ? `<div class="series-timeline" aria-label="${esc(item.title)}の子タイムライン">${item.children.map((child, i) => cardHtml(child, i, item.children, true)).join("")}</div>` : "";
    return `<article class="item ${connection} ${nested ? "nested-item" : ""} ${container ? "container-item" : ""}" data-id="${esc(item.id)}" aria-label="${esc(item.title)}">
      <button type="button" class="timeline-node ${point ? "point" : "activity"}" data-focus="${esc(item.id)}" aria-label="${esc(item.title)}にフォーカス（${point ? "地点" : "活動"}）" aria-pressed="false"><span aria-hidden="true"></span></button>
      <button type="button" class="card-focus" data-focus="${esc(item.id)}" aria-pressed="false">
        <span class="time"><time datetime="${esc(item.start)}">${esc(time)}</time>${end}</span><span class="item-title">${esc(item.title)}</span>
        <span class="badges">${[container ? (item.structure === "Series" ? "系列" : "候補グループ") : null, item.type, item.status, item.transport, item.reservationStatus].filter(Boolean).map((value) => `<span class="badge">${esc(label(value))}</span>`).join("")}</span>
        ${Number.isFinite(item.perPersonCost) || Number.isFinite(item.totalCost) ? `<span class="summary-cost">${Number.isFinite(item.perPersonCost) ? `1人 ${cost(item.perPersonCost, item.currency)}` : `全体 ${cost(item.totalCost, item.currency)}`}</span>` : ""}
      </button>
      ${missing && !container ? '<p class="location-warning">地図に表示できる位置情報がありません。</p>' : ""}
      ${item.type === "Transit" ? '<p class="route-note">地図の破線は概略線です。</p>' : ""}
      ${item.parentId && tree.byId.get(item.parentId)?.structure === "Alternative Group" ? comparisonHtml(item) : ""}
      <button type="button" class="details-toggle" aria-expanded="${expanded}" aria-controls="details-${esc(item.id)}">${expanded ? "詳細を閉じる" : "詳細を開く"}</button>
      <div class="item-details" id="details-${esc(item.id)}" ${expanded ? "" : "hidden"}>${details(item)}${item.structure === "Series" ? children : ""}</div>
      <button type="button" class="select-toggle" role="checkbox" aria-checked="${selection}" data-select="${esc(item.id)}">${selection === "true" ? "✓ 選択済み" : selection === "mixed" ? "− 一部選択" : "選択する"}<span class="sr-only"> ${esc(item.title)}</span></button>
      ${item.structure === "Alternative Group" ? children : ""}
    </article>`;
}
function comparisonHtml(item) {
  const duration = item.end && item.start?.includes("T") ? Math.round((Date.parse(item.end) - Date.parse(item.start)) / 60000) : item.durationMinutes;
  return `<dl class="candidate-facts"><div><dt>所要時間</dt><dd>${Number.isFinite(duration) ? `${duration}分` : "未設定"}</dd></div><div><dt>費用</dt><dd>${Number.isFinite(item.perPersonCost) ? `1人 ${cost(item.perPersonCost, item.currency)}` : Number.isFinite(item.totalCost) ? `全体 ${cost(item.totalCost, item.currency)}` : "未設定"}</dd></div><div><dt>予約</dt><dd>${esc(label(item.reservationStatus) || "未設定")}</dd></div><div><dt>場所</dt><dd>${esc(itemPlaces(item, places).map((place) => place.name).join(" → ") || "詳細の子項目を確認")}</dd></div></dl>`;
}
function candidateHtml(group) {
  const index = Math.max(0, group.children.findIndex((child) => child.id === state.activeCandidateByGroup.get(group.id)));
  return `<div class="candidate-controls" data-group="${esc(group.id)}"><button type="button" data-candidate-step="-1" aria-label="${esc(group.title)}の前の候補" ${index === 0 ? "hidden" : ""}>←</button><span class="candidate-position">${index + 1} / ${group.children.length}</span><button type="button" data-candidate-step="1" aria-label="${esc(group.title)}の次の候補" ${index === group.children.length - 1 ? "hidden" : ""}>→</button></div>
    <div class="group-candidates" data-group="${esc(group.id)}" tabindex="0" aria-label="${esc(group.title)}の候補。左右矢印キーで切り替え">${group.children.map((child, i) => `<div class="candidate-slot" data-candidate="${esc(child.id)}"><button type="button" class="activate-candidate" data-activate="${esc(child.id)}" data-group="${esc(group.id)}" aria-pressed="${i === index}">候補 ${i + 1} を表示</button>${cardHtml(child, i, group.children, true)}</div>`).join("")}</div>`;
}
function renderItems({ fit = true } = {}) {
  visibleRoots = filterTree(tree.roots, state.filters, state.selectedIds, state.selectedDay, data.trip.timezone);
  visibleItems = flattenTree(visibleRoots);
  if (state.focusedItemId && !visibleItems.some((item) => item.id === state.focusedItemId)) {
    state.focusedItemId = null; app.querySelector(".focus-status").textContent = "フォーカス中の予定が表示対象から外れたため、フォーカスを解除しました。";
  }
  for (const group of visibleItems.filter((item) => item.structure === "Alternative Group")) {
    if (!group.children.some((child) => child.id === state.activeCandidateByGroup.get(group.id))) state.activeCandidateByGroup.set(group.id, group.children[0]?.id);
  }
  state.mapTimeRange ||= initialTimeRange(visibleItems, state.selectedDay, data.trip.timezone);
  itemsElement.innerHTML = visibleRoots.length ? visibleRoots.map((item, i) => cardHtml(item, i, visibleRoots)).join("") : `<div class="empty"><p>この日の公開予定はありません。</p><p>上の日付ボタンまたはフィルターを確認できます。</p>${days.filter((day) => day !== state.selectedDay).map((day) => `<button type="button" data-other-day="${esc(day)}">${esc(formatDay(day))}へ</button>`).join("")}</div>`;
  itemsElement.querySelectorAll("[data-focus]").forEach((button) => button.addEventListener("click", () => focusItem(button.dataset.focus, "card")));
  itemsElement.querySelectorAll(".item").forEach((card) => card.addEventListener("click", (event) => { if (!event.target.closest("button, a") && event.target.closest(".item") === card) focusItem(card.dataset.id, "card"); }));
  itemsElement.querySelectorAll(".details-toggle").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest(".item").dataset.id, expanded = !state.expandedItemIds.has(id);
    expanded ? state.expandedItemIds.add(id) : state.expandedItemIds.delete(id); setExpanded(button, expanded);
  }));
  itemsElement.querySelectorAll("[data-other-day]").forEach((button) => button.addEventListener("click", () => selectDay(button.dataset.otherDay)));
  itemsElement.querySelectorAll("[data-select]").forEach((button) => button.addEventListener("click", () => {
    state.selectedIds = toggleSelection(tree.byId.get(button.dataset.select), state.selectedIds);
    if (state.filters.selectedOnly) {
      const id = button.dataset.select; renderItems({ fit: false });
      (itemsElement.querySelector(`[data-select="${CSS.escape(id)}"]`) || app.querySelector(".clear-selection")).focus({ preventScroll: true });
    } else { paintSelection(); paintFocus(); updateComparisonStatus(); }
  }));
  setupCandidates(); updateComparisonStatus(); renderTimeControls(); renderMap(fit); paintFocus();
}

function setExpanded(button, expanded) {
  button.setAttribute("aria-expanded", String(expanded)); button.textContent = expanded ? "詳細を閉じる" : "詳細を開く";
  document.getElementById(button.getAttribute("aria-controls")).hidden = !expanded;
}

function cardIsDisplayed(card) {
  if (!card.getClientRects().length) return false;
  const carousel = card.closest(".group-candidates");
  if (!carousel) return true;
  const rect = card.getBoundingClientRect(), windowRect = carousel.getBoundingClientRect();
  return rect.left < windowRect.right && rect.right > windowRect.left;
}
function setupComparisonControls() {
  app.querySelector(".clear-selection").addEventListener("click", () => { state.selectedIds.clear(); renderItems({ fit: false }); });
  for (const [selector, key] of [[".selected-only", "selectedOnly"], [".show-cancelled", "showCancelled"]]) app.querySelector(selector).addEventListener("change", (event) => { state.filters[key] = event.target.checked; renderItems({ fit: false }); });
  app.querySelector(".clear-filters").addEventListener("click", () => { state.filters = defaultFilters(); renderFilterFields(); renderItems({ fit: false }); });
  app.querySelector(".reservation-shortcut").addEventListener("click", () => { state.filters.reservationStatus = ["Required", "Pending"]; renderFilterFields(); renderItems({ fit: false }); });
  for (const key of ["start", "end"]) app.querySelector(`.time-${key}`).addEventListener("input", (event) => {
    const value = Number(event.target.value), range = state.mapTimeRange;
    range[key] = key === "start" ? Math.min(value, range.end - 15) : Math.max(value, range.start + 15);
    renderTimeControls(); renderMap(false); paintFocus();
  });
  for (const [selector, direction] of [[".time-prev", -1], [".time-next", 1]]) app.querySelector(selector).addEventListener("click", () => {
    state.mapTimeRange = shiftTimeRange(state.mapTimeRange, direction); renderTimeControls(); renderMap(false); paintFocus();
  });
  app.querySelector(".time-reset").addEventListener("click", () => { state.mapTimeRange = initialTimeRange(visibleItems, state.selectedDay, data.trip.timezone); renderTimeControls(); renderMap(false); paintFocus(); });
}
function renderFilterFields() {
  const names = { type: "日程種別", status: "計画状態", reservationStatus: "予約状態", transport: "移動手段" };
  app.querySelector(".filter-fields").innerHTML = Object.entries(names).map(([key, title]) => {
    const values = [...new Set(data.items.map((item) => item[key]).filter(Boolean))].sort();
    return `<fieldset><legend>${title}（複数選択可）</legend>${values.map((value) => `<label class="check-label"><input type="checkbox" data-filter="${key}" value="${esc(value)}" ${state.filters[key].includes(value) ? "checked" : ""}>${esc(label(value))}</label>`).join("")}</fieldset>`;
  }).join("");
  app.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("change", () => {
    const values = state.filters[input.dataset.filter]; state.filters[input.dataset.filter] = input.checked ? [...values, input.value] : values.filter((value) => value !== input.value);
    renderItems({ fit: false });
  }));
  app.querySelector(".selected-only").checked = state.filters.selectedOnly; app.querySelector(".show-cancelled").checked = state.filters.showCancelled;
}
function updateComparisonStatus() {
  const visible = new Set(visibleItems.map((item) => item.id)), hidden = [...state.selectedIds].filter((id) => !visible.has(id)).length;
  app.querySelector(".comparison-status").textContent = `${filtersActive(state.filters) ? "フィルター中 · " : ""}該当 ${visibleItems.filter((item) => structureOf(item) === "Item").length}件 · 選択 ${state.selectedIds.size}件（非表示 ${hidden}件）`;
  const reservations = state.filters.reservationStatus;
  app.querySelector(".reservation-shortcut").setAttribute("aria-pressed", String(reservations.length === 2 && reservations.includes("Required") && reservations.includes("Pending")));
}
function renderTimeControls() {
  const range = state.mapTimeRange;
  app.querySelector(".time-start").max = range.end - 15; app.querySelector(".time-end").min = range.start + 15;
  for (const key of ["start", "end"]) {
    const input = app.querySelector(`.time-${key}`); input.value = range[key]; input.setAttribute("aria-valuetext", minuteLabel(range[key]));
    app.querySelector(`.time-${key}-label`).textContent = minuteLabel(range[key]);
  }
  app.querySelector(".time-summary").textContent = `${minuteLabel(range.start)}–${minuteLabel(range.end)}`;
  app.querySelector(".time-prev").disabled = range.start === 0; app.querySelector(".time-next").disabled = range.end === 1440;
}
function setupCandidates() {
  itemsElement.querySelectorAll("[data-candidate-step]").forEach((button) => button.addEventListener("click", () => stepCandidate(button.closest("[data-group]").dataset.group, Number(button.dataset.candidateStep))));
  itemsElement.querySelectorAll("[data-activate]").forEach((button) => button.addEventListener("click", () => activateCandidate(button.dataset.group, button.dataset.activate)));
  itemsElement.querySelectorAll(".group-candidates").forEach((carousel) => {
    const active = carousel.querySelector(`[data-candidate="${CSS.escape(state.activeCandidateByGroup.get(carousel.dataset.group))}"]`);
    if (active) carousel.scrollLeft = active.offsetLeft - carousel.firstElementChild.offsetLeft;
    carousel.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || event.target !== carousel) return;
      event.preventDefault(); stepCandidate(carousel.dataset.group, event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "Home" ? -Infinity : Infinity);
    });
    let timer;
    carousel.addEventListener("scroll", () => {
      clearTimeout(timer); timer = setTimeout(() => {
        if (!mobile()) { updateCandidateControls(carousel.dataset.group); return; }
        const slots = [...carousel.children]; const left = carousel.getBoundingClientRect().left;
        const nearest = slots.reduce((best, slot) => Math.abs(slot.getBoundingClientRect().left - left) < Math.abs(best.getBoundingClientRect().left - left) ? slot : best, slots[0]);
        if (nearest) activateCandidate(carousel.dataset.group, nearest.dataset.candidate, false);
      }, 120);
    }, { passive: true });
  });
}
function stepCandidate(groupId, direction) {
  const group = visibleItems.find((node) => node.id === groupId);
  const index = group.children.findIndex((node) => node.id === state.activeCandidateByGroup.get(groupId));
  activateCandidate(groupId, group.children[Math.max(0, Math.min(group.children.length - 1, index + direction))].id);
}
function activateCandidate(groupId, id, scroll = true) {
  const changed = state.activeCandidateByGroup.get(groupId) !== id;
  state.activeCandidateByGroup.set(groupId, id);
  const carousel = itemsElement.querySelector(`.group-candidates[data-group="${CSS.escape(groupId)}"]`);
  if (carousel) {
    const slot = carousel.querySelector(`[data-candidate="${CSS.escape(id)}"]`);
    if (scroll && slot) carousel.scrollTo({ left: slot.offsetLeft - carousel.firstElementChild.offsetLeft, behavior: reducedMotion() ? "instant" : "smooth" });
    carousel.querySelectorAll("[data-activate]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.activate === id)));
    updateCandidateControls(groupId);
  }
  if (changed) {
    const group = visibleItems.find((node) => node.id === groupId);
    app.querySelector(".focus-status").textContent = `${group.title}：${group.children.find((node) => node.id === id).title}を表示しています。`;
    renderMap(false); paintFocus();
  }
}
function updateCandidateControls(groupId) {
  const group = visibleItems.find((node) => node.id === groupId), index = group.children.findIndex((node) => node.id === state.activeCandidateByGroup.get(groupId));
  const controls = itemsElement.querySelector(`.candidate-controls[data-group="${CSS.escape(groupId)}"]`);
  controls.querySelector(".candidate-position").textContent = `${index + 1} / ${group.children.length}`;
  controls.querySelector('[data-candidate-step="-1"]').hidden = index === 0; controls.querySelector('[data-candidate-step="1"]').hidden = index === group.children.length - 1;
  const carousel = itemsElement.querySelector(`.group-candidates[data-group="${CSS.escape(groupId)}"]`);
  carousel.dataset.before = String(carousel.scrollLeft > 2); carousel.dataset.after = String(carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 2);
}
function paintSelection() {
  itemsElement.querySelectorAll("[data-select]").forEach((button) => {
    const selection = selectionState(tree.byId.get(button.dataset.select), state.selectedIds);
    button.setAttribute("aria-checked", selection); button.firstChild.textContent = selection === "true" ? "✓ 選択済み" : selection === "mixed" ? "− 一部選択" : "選択する";
  });
}

function paintFocus() {
  const focused = focusedMapIds(state.focusedItemId, visibleRoots, state.activeCandidateByGroup);
  const selected = (id) => { const node = tree.byId.get(id); return node && selectionState(node, state.selectedIds) !== "false"; };
  itemsElement.querySelectorAll(".item").forEach((card) => {
    const active = card.dataset.id === state.focusedItemId;
    card.classList.toggle("active", active); card.querySelectorAll("[data-focus]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.focus === state.focusedItemId)));
    card.classList.toggle("comparison-selected", selected(card.dataset.id));
  });
  markers.forEach(({ marker, ids }) => {
    const active = ids.some((id) => focused.has(id)), element = marker.getElement();
    const chosen = ids.some(selected);
    element?.classList.toggle("selected-pin", chosen); element?.classList.toggle("unselected-pin", state.selectedIds.size > 0 && !chosen);
    element?.classList.toggle("focused-pin", active); element?.setAttribute("aria-pressed", String(active)); marker.setZIndexOffset(active ? 1000 : 0);
  });
  for (const [id, layers] of itemLayers) for (const layer of layers) {
    if (layer.routeVisual) {
      const active = focused.has(id), chosen = selected(id);
      layer.routeVisual.setStyle({ color: active ? "#9f3f26" : chosen ? "#286d62" : "#163a35", weight: active ? 7 : chosen ? 5 : 3, opacity: state.selectedIds.size && !chosen ? .65 : 1 });
      layer.getElement()?.classList.toggle("selected-route", chosen); layer.getElement()?.setAttribute("aria-pressed", String(active));
    }
  }
}

function focusItem(id, source) {
  if (!visibleItems.some((item) => item.id === id)) return;
  if (source !== "scroll") clearTimeout(scrollTimer);
  const node = tree.byId.get(id);
  let branch = node;
  while (branch?.parentId) {
    const parent = tree.byId.get(branch.parentId);
    if (parent.structure === "Alternative Group") activateCandidate(parent.id, branch.id);
    if (source === "map" && parent.structure === "Series") {
      state.expandedItemIds.add(parent.id);
      const toggle = itemsElement.querySelector(`[data-id="${CSS.escape(parent.id)}"] > .details-toggle`); if (toggle) setExpanded(toggle, true);
    }
    branch = parent;
  }
  const changed = state.focusedItemId !== id;
  state.focusedItemId = id; state.focusSource = source; paintFocus();
  const card = [...itemsElement.querySelectorAll(".item")].find((element) => element.dataset.id === id);
  if (source === "map" && card) {
    programmaticScroll = true; clearTimeout(scrollTimer);
    const rect = timeline.getBoundingClientRect(), spot = rect.height * (mobile() ? .35 : .5);
    timeline.scrollTo({ top: timeline.scrollTop + card.getBoundingClientRect().top - rect.top - spot, behavior: reducedMotion() ? "instant" : "smooth" });
    card.querySelector(".card-focus").focus({ preventScroll: true });
    scrollTimer = setTimeout(() => { programmaticScroll = false; }, 1000);
  }
  if (!map || !changed || source === "map") return;
  const focusIds = focusedMapIds(id, visibleRoots, state.activeCandidateByGroup);
  const item = geographicItems.find((value) => focusIds.has(value.id)), coordinate = item && itemPlaces(item, places).filter(hasCoordinates)[0];
  if (coordinate && !map.getBounds().pad(-.15).contains([coordinate.latitude, coordinate.longitude])) map.panTo([coordinate.latitude, coordinate.longitude], { animate: !reducedMotion() });
  const layer = itemLayers.get(item?.id)?.find((value) => value.getLatLng);
  layer?.openPopup();
}

function popupFor(place, items) {
  const root = document.createElement("div"), heading = document.createElement("strong");
  heading.textContent = place.name; root.append(heading);
  items.forEach((item) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "popup-item";
    button.textContent = `${formatTime(item.start, data.trip.timezone)} ${item.title}`;
    button.addEventListener("click", () => { if (mobile() && state.mapPanelMode === "expanded") setMapMode("standard"); focusItem(item.id, "map"); }); root.append(button);
  });
  return root;
}

function renderMap(fit = true) {
  geographicItems = mapNodes(visibleRoots, state.activeCandidateByGroup, state.mapTimeRange, state.selectedDay, data.trip.timezone, places);
  app.querySelector(".time-status").textContent = `地図対象 ${geographicItems.length}件 · タイムラインと選択は変更されません。`;
  if (!map) return;
  map.closePopup(); layerGroup.clearLayers(); itemLayers = new Map(); markers = []; bounds = [];
  const grouped = new Map();
  geographicItems.forEach((item) => {
    const locations = itemPlaces(item, places).filter(hasCoordinates); itemLayers.set(item.id, []);
    locations.forEach((place) => {
      if (!grouped.has(place.id)) grouped.set(place.id, { place, items: [] });
      if (!grouped.get(place.id).items.includes(item)) grouped.get(place.id).items.push(item);
    });
    if (item.type === "Transit" && locations.length === 2) {
      const coordinates = locations.map((place) => [place.latitude, place.longitude]);
      const visual = L.polyline(coordinates, { color: "#163a35", weight: 3, dashArray: "8 8", interactive: false }).addTo(layerGroup);
      const hit = L.polyline(coordinates, { color: "transparent", weight: 44, className: "route-hit" }).addTo(layerGroup);
      hit.routeVisual = visual; hit.bindPopup(`<strong>${esc(item.title)}</strong><br>${esc(formatTime(item.start, data.trip.timezone))}<br>概略線（実経路ではありません）`, { autoPan: false });
      const activate = () => { if (mobile() && state.mapPanelMode === "expanded") setMapMode("standard"); focusItem(item.id, "map"); };
      hit.on("click", activate);
      const element = hit.getElement(); element.setAttribute("tabindex", "0"); element.setAttribute("role", "button"); element.setAttribute("aria-label", `${item.title}の概略線にフォーカス`);
      element.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); activate(); hit.openPopup(coordinates[0]); } });
      itemLayers.get(item.id).push(hit);
    }
  });
  grouped.forEach(({ place, items }) => {
    const coordinate = [place.latitude, place.longitude]; bounds.push(coordinate);
    const marker = L.marker(coordinate, {
      title: `${place.name}：${items.map((item) => item.title).join("、")}`,
      icon: L.divIcon({ className: "place-pin", html: '<span aria-hidden="true"></span>', iconSize: [44, 44], iconAnchor: [22, 22] }),
    }).bindPopup(popupFor(place, items), { autoPan: false }).addTo(layerGroup);
    marker.on("click", () => { if (items.length === 1) { if (mobile() && state.mapPanelMode === "expanded") setMapMode("standard"); focusItem(items[0].id, "map"); } });
    const element = marker.getElement(); element.setAttribute("aria-label", marker.options.title); element.setAttribute("role", "button");
    element.addEventListener("keydown", (event) => { if (event.key === " ") { event.preventDefault(); marker.fire("click"); marker.openPopup(); } });
    markers.push({ marker, ids: items.map((item) => item.id) }); items.forEach((item) => itemLayers.get(item.id).push(marker));
  });
  app.querySelector(".show-all").disabled = !bounds.length;
  mapStatus(bounds.length ? "" : "この時間範囲の地図に表示できる地点はありません。旅程と外部地図リンクを利用できます。"); if (fit) fitDay();
}

function fitDay() {
  if (!bounds.length || !map) { needsFit = false; return; }
  const rect = app.querySelector("#map").getBoundingClientRect();
  if (!rect.width || !rect.height) { needsFit = true; return; }
  needsFit = false;
  map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14, animate: !reducedMotion() });
}
function mapStatus(message) { const element = app.querySelector(".map-status"); element.textContent = message; element.hidden = !message; }

async function loadMap() {
  try {
    if (!window.L) await new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.async = true;
      const timeout = setTimeout(() => reject(new Error("timeout")), 8000);
      script.onload = () => { clearTimeout(timeout); resolve(); }; script.onerror = () => { clearTimeout(timeout); reject(new Error("load")); }; document.head.append(script);
    });
    map = L.map("map", { zoomControl: true, zoomAnimation: !reducedMotion(), fadeAnimation: !reducedMotion(), markerZoomAnimation: !reducedMotion() }).setView([35.6812, 139.7671], 11);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    let tileErrors = 0;
    tiles.on("tileerror", () => { tileErrors++; mapStatus("背景地図を読み込めません。地点・概略線と旅程、外部地図リンクを利用できます。"); });
    tiles.on("loading", () => { tileErrors = 0; }); tiles.on("load", () => { if (!tileErrors && bounds.length) mapStatus(""); });
    layerGroup = L.layerGroup().addTo(map); renderMap(); paintFocus();
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
      map.options.zoomAnimation = !reducedMotion(); map.options.fadeAnimation = !reducedMotion(); map.options.markerZoomAnimation = !reducedMotion();
    });
  } catch { mapStatus("地図ライブラリを読み込めませんでした。旅程一覧と詳細の外部地図リンクは利用できます。"); }
}

function syncStatus(message, warning = false) { statusElement.textContent = message; statusElement.classList.toggle("warning", warning); }
function applySyncHeader(response, updating) {
  const cache = response.headers.get("X-Itinerary-Cache");
  if (cache === "stale") syncStatus("Notionの更新に失敗しました。最後に取得した旅程を表示しています。最新でない可能性があります。", true);
  else if (cache === "throttled") syncStatus("クールダウン中です。前回取得した旅程を表示しています。", true);
  else syncStatus(updating ? "Notionから最新の旅程を取得しました。" : "旅程を読み込みました。");
}
function updateCooldown() {
  if (refreshing) { publishButton.disabled = true; publishButton.textContent = "Notionから更新中…"; return; }
  const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  publishButton.disabled = seconds > 0; publishButton.textContent = seconds ? `再取得まで ${seconds}秒` : "Notionから再取得";
}
async function refresh() {
  if (refreshing || Date.now() < cooldownUntil) return;
  refreshing = true; updateCooldown(); syncStatus("Notionから更新しています…");
  try {
    const response = await fetch(`/api/refresh?slug=${encodeURIComponent(data.trip.slug)}`, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("refresh");
    const next = await response.json();
    if (!["stale", "throttled"].includes(response.headers.get("X-Itinerary-Cache"))) {
      const keyboard = document.activeElement === publishButton, scrollTop = timeline.scrollTop;
      programmaticScroll = true; updateData(next); timeline.scrollTop = scrollTop;
      if (keyboard) publishButton.focus({ preventScroll: true }); setTimeout(() => { programmaticScroll = false; }, 200);
    }
    applySyncHeader(response, true); cooldownUntil = Date.now() + 60000;
  } catch { syncStatus("Notionから再取得できませんでした。表示中の旅程を引き続き利用できます。最新でない可能性があります。再試行してください。", true); }
  finally { refreshing = false; updateCooldown(); }
}

async function start() {
  app.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("/api/itinerary", { cache: "no-store" });
    if (!response.ok) throw new Error("itinerary");
    const next = await response.json(); setupShell(); updateData(next); applySyncHeader(response, false);
    void loadMap(); setInterval(updateCooldown, 1000);
  } catch {
    app.setAttribute("aria-busy", "false");
    app.innerHTML = '<section class="error" role="alert"><h1>旅程を読み込めませんでした。</h1><p>通信状況を確認して、もう一度お試しください。</p><button type="button" class="retry">再試行</button></section>';
    app.querySelector(".retry").addEventListener("click", start);
  }
}
void start();
