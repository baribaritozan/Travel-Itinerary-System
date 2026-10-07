(async function () {
  const app = document.querySelector("#app");
  try {
    const response = await fetch("./data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`data.json: ${response.status}`);
    const data = await response.json();
    document.title = data.trip.name;
    render(data);
  } catch (error) {
    app.innerHTML = `<section class="error">旅程を読み込めませんでした。\n${escapeHtml(error.message)}</section>`;
    app.setAttribute("aria-busy", "false");
  }

  function render(data) {
    const places = new Map(data.places.map((place) => [place.id, place]));
    const days = [...new Set(data.items.map((item) => item.start?.slice(0, 10)).filter(Boolean))];
    const initialDay = chooseInitialDay(days);
    app.className = "shell";
    app.innerHTML = `
      <section class="timeline-panel">
        <header>
          <div class="eyebrow">Travel itinerary</div>
          <h1>${escapeHtml(data.trip.name)}</h1>
          <p class="meta">${formatTripPeriod(data.trip)}</p>
          <p class="sync">最終同期 ${formatDateTime(data.generatedAt, data.trip.timezone)}</p>
        </header>
        <nav class="days" aria-label="日付"></nav>
        <div class="items"></div>
      </section>
      <section class="map-panel" aria-label="地図"><div id="map"></div></section>`;
    app.setAttribute("aria-busy", "false");

    const daysElement = app.querySelector(".days");
    const itemsElement = app.querySelector(".items");
    let selectedDay = initialDay;
    let leafletMap;
    let layerGroup;
    let itemLayers = new Map();

    if (window.L) {
      leafletMap = L.map("map", { zoomControl: true }).setView([35.6812, 139.7671], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(leafletMap);
      layerGroup = L.layerGroup().addTo(leafletMap);
    } else {
      document.querySelector("#map").textContent = "地図ライブラリを読み込めませんでした。旅程一覧は利用できます。";
    }

    function renderDays() {
      daysElement.innerHTML = days.map((day, index) => `
        <button class="day-button" type="button" data-day="${day}" aria-pressed="${day === selectedDay}">
          Day ${index + 1} · ${formatDay(day, data.trip.timezone)}
        </button>`).join("");
      daysElement.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        selectedDay = button.dataset.day;
        renderDays();
        renderItems();
      }));
    }

    function renderItems() {
      const visibleItems = data.items.filter((item) => item.start?.startsWith(selectedDay));
      itemsElement.innerHTML = visibleItems.length ? visibleItems.map((item) => {
        const navigationUrl = item.navigationUrl || buildMapsUrl(item, places);
        return `<article class="item ${item.status === "Cancelled" ? "cancelled" : ""}" tabindex="0" data-id="${item.id}">
          <div class="item-head"><time class="time">${formatTime(item.start, data.trip.timezone)}</time><span class="item-title">${escapeHtml(item.title)}</span></div>
          <span class="badge">${escapeHtml(item.type)}</span>
          ${item.transport ? `<span class="badge">${escapeHtml(item.transport)}</span>` : ""}
          ${item.status ? `<span class="badge">${escapeHtml(item.status)}</span>` : ""}
          ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ""}
          <div class="actions">
            ${navigationUrl ? `<a href="${escapeAttribute(navigationUrl)}" target="_blank" rel="noopener">地図・経路を開く</a>` : ""}
            ${item.reservationUrl ? `<a href="${escapeAttribute(item.reservationUrl)}" target="_blank" rel="noopener">予約を開く</a>` : ""}
          </div>
        </article>`;
      }).join("") : '<p class="empty">この日の公開予定はありません。</p>';

      itemsElement.querySelectorAll(".item").forEach((card) => {
        const activate = () => activateItem(card.dataset.id, false);
        card.addEventListener("click", (event) => { if (!event.target.closest("a")) activate(); });
        card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") activate(); });
      });
      renderMap(visibleItems);
    }

    function renderMap(items) {
      if (!leafletMap) return;
      layerGroup.clearLayers();
      itemLayers = new Map();
      const bounds = [];
      items.forEach((item) => {
        const itemPlaces = item.type === "Transit"
          ? [places.get(item.fromId), places.get(item.toId)].filter(Boolean)
          : [places.get(item.placeId)].filter(Boolean);
        const coordinates = itemPlaces.filter(hasCoordinates).map((place) => [place.latitude, place.longitude]);
        coordinates.forEach((coordinate, index) => {
          const place = itemPlaces[index];
          const marker = L.marker(coordinate).bindPopup(`<strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(place?.name ?? "")}`);
          marker.on("click", () => activateItem(item.id, true));
          marker.addTo(layerGroup);
          if (!itemLayers.has(item.id)) itemLayers.set(item.id, []);
          itemLayers.get(item.id).push(marker);
          bounds.push(coordinate);
        });
        if (coordinates.length === 2) {
          const line = L.polyline(coordinates, { color: "#d95d39", weight: 4, dashArray: "7 7" }).addTo(layerGroup);
          itemLayers.get(item.id).push(line);
        }
      });
      if (bounds.length) leafletMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
      setTimeout(() => leafletMap.invalidateSize(), 0);
    }

    function activateItem(itemId, scroll) {
      itemsElement.querySelectorAll(".item").forEach((card) => card.classList.toggle("active", card.dataset.id === itemId));
      const card = itemsElement.querySelector(`[data-id="${CSS.escape(itemId)}"]`);
      if (scroll && card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      const layers = itemLayers.get(itemId) ?? [];
      const coordinates = layers.filter((layer) => layer.getLatLng).map((layer) => layer.getLatLng());
      if (coordinates.length === 1) leafletMap.setView(coordinates[0], Math.max(leafletMap.getZoom(), 15), { animate: true });
      if (coordinates.length > 1) leafletMap.fitBounds(coordinates, { padding: [40, 40], maxZoom: 15 });
    }

    renderDays();
    renderItems();
  }

  function chooseInitialDay(days) {
    const today = new Date().toISOString().slice(0, 10);
    return days.find((day) => day >= today) ?? days.at(-1) ?? today;
  }

  function hasCoordinates(place) {
    return Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude);
  }

  function buildMapsUrl(item, places) {
    const from = places.get(item.fromId);
    const to = places.get(item.toId);
    const place = places.get(item.placeId);
    if (hasCoordinates(from) && hasCoordinates(to)) {
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${from.latitude},${from.longitude}`)}&destination=${encodeURIComponent(`${to.latitude},${to.longitude}`)}`;
    }
    if (hasCoordinates(place)) return place.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`;
    return null;
  }

  function formatTripPeriod(trip) {
    if (!trip.start) return "日程未設定";
    const start = formatDay(trip.start.slice(0, 10), trip.timezone);
    const end = trip.end ? formatDay(trip.end.slice(0, 10), trip.timezone) : null;
    return end && end !== start ? `${start} – ${end}` : start;
  }

  function formatDay(value, timeZone) {
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone }).format(new Date(`${value}T12:00:00Z`));
  }

  function formatTime(value, timeZone) {
    if (!value || !value.includes("T")) return "終日";
    return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(value));
  }

  function formatDateTime(value, timeZone) {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
