const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

I18N.init();

const t = (key, vars) => I18N.t(key, vars);

const PAGE_SIZES = [20, 50, 100];

function savedPageSize() {
  try {
    const value = Number(localStorage.getItem("asset_page_size"));
    return PAGE_SIZES.includes(value) ? value : 20;
  } catch {
    return 20;
  }
}

const state = {
  user: null,
  storage: "s3",
  ownerOnly: false,
  items: [],
  stats: {},
  editingId: null,
  detailId: null,
  editorMode: "create",
  activePasteField: null,
  files: { photo: null, screenshot: null, glb: null },
  removed: { photo: false, screenshot: false, glb: false },
  existing: { photo_url: "", screenshot_url: "", glb_url: "" },
  objectUrls: [],
  viewMode: localStorage.getItem("asset_view") === "card" ? "card" : "table",
  cardObserver: null,
  compressing: {},
  page: 1,
  pageSize: savedPageSize(),
  pagination: null,
};

const ICONS = {
  view: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/><path d="m3.7 7.5 8.3 4.8 8.3-4.8M12 12.3v8.8"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.5 6.5 3 3"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 18.5h15"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15"/><path d="M9 7V4.5h6V7"/><path d="m6.5 7 .8 12.5h9.4L17.5 7"/><path d="M10.5 10.8v5.4M13.5 10.8v5.4"/></svg>`,
};

function applyStaticI18n() {
  document.documentElement.lang = I18N.current === "en" ? "en" : "zh-CN";
  document.title = t("app.title");
  $$("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  $$("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  $$("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  $$("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  $$("[data-i18n-alt]").forEach((element) => {
    element.alt = t(element.dataset.i18nAlt);
  });
  $$("#langSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === I18N.current);
    button.setAttribute("aria-pressed", String(button.dataset.lang === I18N.current));
  });
}

function setLanguage(lang) {
  if (!I18N.languages.includes(lang)) return;
  I18N.set(lang);
  applyStaticI18n();
  renderStats();
  renderFilterOptions();
  renderAssets();
  renderPager();
  renderUser();
  if (!$("#editorOverlay").hidden) refreshEditorLabels();
  if (!$("#detailOverlay").hidden && state.detailId) openDetail(state.detailId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = size;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function incrementTrailingNumber(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return `${text} 2`;
  const digits = match[2];
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return match[1] + next;
}

function applyCreateDefaults() {
  const last = state.stats.lastCreated;
  if (!last) return;
  $("#nameInput").value = incrementTrailingNumber(last.name || "");
  $("#codeInput").value = incrementTrailingNumber(last.code || "");
  $("#categoryInput").value = last.category || "";
}

function toast(message, type = "success") {
  const stack = $("#toastStack");
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  stack.appendChild(element);
  setTimeout(() => element.remove(), 3200);
}

function can(perm) {
  return Boolean(state.user?.permissions?.[perm]);
}

function goLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login.html?next=${next}`;
}

async function apiFetch(url, options = {}) {
  const { json, headers, ...rest } = options;
  const init = { credentials: "same-origin", ...rest };
  init.headers = { "X-Requested-With": "ModelVault", ...(headers || {}) };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, init);
  if (response.status === 401 && url !== "/api/auth/password") {
    goLogin();
    throw new Error(t("auth.sessionExpired"));
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error || t("error.request", { status: response.status });
    throw new Error(I18N.serverError(message));
  }
  return payload;
}

function currentQuery() {
  const params = new URLSearchParams();
  const query = $("#searchInput").value.trim();
  const category = $("#categoryFilter").value;
  const status = $("#statusFilter").value;
  const sort = $("#sortSelect").value;
  if (query) params.set("query", query);
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  params.set("sort", sort);
  params.set("page", String(state.page));
  params.set("page_size", String(state.pageSize));
  return params;
}

function reloadFromFirstPage() {
  state.page = 1;
  loadAssets();
}

function goToPage(page) {
  const pages = state.pagination?.pages || 1;
  const next = Math.max(1, Math.min(pages, page));
  if (next === state.page) return;
  state.page = next;
  loadAssets().then(() => {
    const panel = $(".panel");
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function pageWindow(current, pages) {
  const set = new Set([1, pages, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (current >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => set.add(n));
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const result = [];
  list.forEach((n, index) => {
    if (index && n - list[index - 1] > 1) result.push("…");
    result.push(n);
  });
  return result;
}

function renderPager() {
  const info = state.pagination || { page: 1, pages: 1, total: 0, pageSize: state.pageSize };
  const bar = $("#pagerBar");
  bar.hidden = info.total === 0;
  const from = info.total ? (info.page - 1) * info.pageSize + 1 : 0;
  const to = Math.min(info.total, info.page * info.pageSize);
  $("#pagerInfo").textContent = t("pager.info", { from, to, total: info.total });
  const buttons = [
    `<button type="button" class="pager-btn" data-page="${info.page - 1}" ${info.page <= 1 ? "disabled" : ""} aria-label="${t("pager.prev")}">‹</button>`,
    ...pageWindow(info.page, info.pages).map((item) =>
      item === "…"
        ? `<span class="pager-gap">…</span>`
        : `<button type="button" class="pager-btn ${item === info.page ? "active" : ""}" data-page="${item}" ${item === info.page ? 'aria-current="page"' : ""}>${item}</button>`
    ),
    `<button type="button" class="pager-btn" data-page="${info.page + 1}" ${info.page >= info.pages ? "disabled" : ""} aria-label="${t("pager.next")}">›</button>`,
  ];
  $("#pagerControls").innerHTML = buttons.join("");
  const select = $("#pageSizeSelect");
  select.innerHTML = PAGE_SIZES.map(
    (size) => `<option value="${size}" ${size === state.pageSize ? "selected" : ""}>${t("pager.perPage", { count: size })}</option>`
  ).join("");
}

async function loadAssets() {
  try {
    const data = await apiFetch(`/api/assets?${currentQuery().toString()}`);
    state.items = data.items || [];
    state.stats = data.stats || {};
    state.pagination = data.pagination || null;
    if (state.pagination) state.page = state.pagination.page;
    renderPager();
    state.storage = data.storage || "s3";
    $("#storageBanner").hidden = state.storage !== "none";
    renderStats();
    renderFilterOptions();
    renderAssets();
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderStats() {
  const stats = state.stats;
  const cards = [
    { label: t("stat.total"), value: stats.total ?? 0, note: t("stat.totalNote"), color: "var(--primary-soft)" },
    { label: t("stat.pending"), value: stats.pending ?? 0, note: t("stat.pendingNote"), color: "#eef1f7" },
    { label: t("stat.completed"), value: stats.completed ?? 0, note: t("stat.completedNote"), color: "var(--accent-soft)" },
    { label: t("stat.size"), value: formatBytes(stats.totalSize), note: t("stat.sizeNote"), color: "var(--warning-soft)" },
  ];
  $("#stats").innerHTML = cards
    .map(
      (card) => `
      <article class="stat-card" style="--stat-soft:${card.color}">
        <div class="stat-label">${escapeHtml(card.label)}</div>
        <div class="stat-value">${escapeHtml(card.value)}</div>
        <div class="stat-note">${escapeHtml(card.note)}</div>
      </article>`
    )
    .join("");
}

function renderFilterOptions() {
  const categories = state.stats.categories || [];
  const categorySelect = $("#categoryFilter");
  const previous = categorySelect.value;
  categorySelect.innerHTML = `<option value="">${t("filter.categoryAll")}</option>${categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
  categorySelect.value = categories.includes(previous) ? previous : "";
  $("#categoryOptions").innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
  renderTagBar();
}

function splitTags(text) {
  return String(text || "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// Row of popular tags under the search bar: click to search, click again to clear.
function renderTagBar() {
  const tags = state.stats.popularTags || [];
  $("#tagBar").hidden = !tags.length;
  const current = $("#searchInput").value.trim().toLowerCase();
  $("#tagBarList").innerHTML = tags
    .map(({ tag, count }) => {
      const active = tag.toLowerCase() === current;
      return `<button type="button" class="tag-chip ${active ? "active" : ""}" data-tag="${escapeHtml(tag)}" aria-pressed="${active}">${escapeHtml(tag)}<small>${count}</small></button>`;
    })
    .join("");
}

// Popular tags under the editor's tag field: click to add, click again to remove.
function renderTagSuggest() {
  const tags = state.stats.popularTags || [];
  const box = $("#tagSuggest");
  box.hidden = !tags.length;
  const chosen = new Set(splitTags($("#tagsInput").value).map((tag) => tag.toLowerCase()));
  box.innerHTML = tags
    .map(({ tag }) => {
      const active = chosen.has(tag.toLowerCase());
      return `<button type="button" class="tag-chip ${active ? "active" : ""}" data-tag="${escapeHtml(tag)}" aria-pressed="${active}">${escapeHtml(tag)}</button>`;
    })
    .join("");
}

function toggleEditorTag(tag) {
  const list = splitTags($("#tagsInput").value);
  const index = list.findIndex((item) => item.toLowerCase() === tag.toLowerCase());
  if (index >= 0) list.splice(index, 1);
  else list.push(tag);
  const text = list.join(", ");
  if (text.length > 240) {
    toast(t("tags.tooLong"), "error");
    return;
  }
  $("#tagsInput").value = text;
  renderTagSuggest();
}

function renderTable() {
  const tbody = $("#assetTableBody");
  const items = state.items;
  $("#resultCount").textContent = t("common.resultCount", { count: state.stats.filtered ?? items.length });
  const hasFilter =
    $("#searchInput").value.trim() || $("#categoryFilter").value || $("#statusFilter").value;
  $("#emptyState").hidden = items.length > 0;
  $("#emptyHint").textContent = hasFilter ? t("empty.filtered") : t("empty.default");

  const previewLabel = t("table.photo");
  const screenshotLabel = t("table.screenshot");
  const viewLabel = t("common.preview");
  const editLabel = t("common.edit");
  const downloadLabel = t("common.download");
  const deleteLabel = t("common.delete");

  tbody.innerHTML = items
    .map((item) => {
      const tags = (item.tags || "")
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 3);
      const people = [
        item.creator ? `${t("table.byCreator")} ${item.creator}` : "",
        item.maker ? `${t("table.byMaker")} ${item.maker}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `
        <tr>
          <td>${mediaCell(item.photo_url, previewLabel)}</td>
          <td>${mediaCell(item.screenshot_url, screenshotLabel)}</td>
          <td>
            <div class="asset-name">${escapeHtml(item.name)}</div>
            <div class="asset-code">${item.code ? escapeHtml(item.code) : t("table.unnumbered")}${people ? ` · ${escapeHtml(people)}` : ""}</div>
          </td>
          <td>
            <div class="category-text">${item.category ? escapeHtml(item.category) : `<span class="muted">${t("table.uncategorized")}</span>`}</div>
            ${tags.length ? `<div class="tag-list">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </td>
          <td><span class="status-chip" data-status="${escapeHtml(item.status)}">${escapeHtml(I18N.status(item.status))}</span></td>
          <td>
            ${
              item.glb_url
                ? `<div class="file-pill"><span class="file-dot"></span><div><strong>${escapeHtml(item.glb_name || "model.glb")}</strong><br>${formatBytes(item.glb_size)}</div></div>`
                : `<span class="muted">${t("table.noModel")}</span>`
            }
          </td>
          <td class="muted">${escapeHtml(item.updated_at || "")}</td>
          <td>
            <div class="row-actions">
              <button class="action-btn view" type="button" data-action="view" data-id="${item.id}" title="${viewLabel}" aria-label="${viewLabel}">${ICONS.view}</button>
              ${item.can_edit ? `<button class="action-btn edit" type="button" data-action="edit" data-id="${item.id}" title="${editLabel}" aria-label="${editLabel}">${ICONS.edit}</button>` : ""}
              <button class="action-btn download" type="button" data-action="download" data-id="${item.id}" title="${downloadLabel}" aria-label="${downloadLabel}" ${item.has_glb ? "" : "disabled"}>${ICONS.download}</button>
              ${item.can_delete ? `<button class="action-btn danger" type="button" data-action="delete" data-id="${item.id}" title="${deleteLabel}" aria-label="${deleteLabel}">${ICONS.delete}</button>` : ""}
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function renderAssets() {
  const isCard = state.viewMode === "card";
  $("#tableView").hidden = isCard;
  $("#assetCardGrid").hidden = !isCard;
  $$("#viewSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.viewMode);
  });
  if (isCard) renderCards();
  else renderTable();
}

function renderCards() {
  const grid = $("#assetCardGrid");
  if (state.cardObserver) {
    state.cardObserver.disconnect();
    state.cardObserver = null;
  }

  const hasFilter =
    $("#searchInput").value.trim() || $("#categoryFilter").value || $("#statusFilter").value;
  $("#emptyState").hidden = state.items.length > 0;
  $("#emptyHint").textContent = hasFilter ? t("empty.filtered") : t("empty.default");

  const previewLabel = t("table.photo");
  const viewLabel = t("common.preview");
  const editLabel = t("common.edit");
  const downloadLabel = t("common.download");
  const deleteLabel = t("common.delete");

  grid.innerHTML = state.items
    .map((item) => {
      const tags = (item.tags || "")
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 3);
      const viewer = item.glb_url
        ? `<model-viewer data-model-src="${escapeHtml(item.glb_url)}" alt="${escapeHtml(item.name)}" loading="lazy" camera-controls auto-rotate auto-rotate-delay="0" rotation-per-second="24deg" shadow-intensity="1" exposure="1" environment-image="/static/env/studio.hdr" interaction-prompt="none"></model-viewer>
           <span class="card-badge">${t("card.autoRotate")}</span>`
        : item.photo_url
          ? `<img src="${escapeHtml(item.photo_url)}" alt="${escapeHtml(previewLabel)}" title="${escapeHtml(t("table.clickZoom") + previewLabel)}" data-action="image" data-url="${escapeHtml(item.photo_url)}" data-label="${escapeHtml(previewLabel)}">`
          : `<div class="viewer-placeholder">${t("card.noModel")}</div>`;

      return `
        <article class="asset-card">
          <div class="card-viewer">
            ${viewer}
          </div>
          <div class="card-body">
            <h3 class="card-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
            <div class="card-meta">${item.code ? escapeHtml(item.code) : t("table.unnumbered")} · ${formatBytes(item.glb_size)}</div>
            <div class="card-row">
              <span class="status-chip" data-status="${escapeHtml(item.status)}">${escapeHtml(I18N.status(item.status))}</span>
              <span class="card-time">${escapeHtml(item.updated_at || "")}</span>
            </div>
            ${tags.length ? `<div class="tag-list">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </div>
          <div class="card-footer">
            <button class="action-btn view" type="button" data-action="view" data-id="${item.id}" title="${viewLabel}" aria-label="${viewLabel}">${ICONS.view}</button>
            ${item.can_edit ? `<button class="action-btn edit" type="button" data-action="edit" data-id="${item.id}" title="${editLabel}" aria-label="${editLabel}">${ICONS.edit}</button>` : ""}
            <button class="action-btn download" type="button" data-action="download" data-id="${item.id}" title="${downloadLabel}" aria-label="${downloadLabel}" ${item.has_glb ? "" : "disabled"}>${ICONS.download}</button>
            ${item.can_delete ? `<button class="action-btn danger" type="button" data-action="delete" data-id="${item.id}" title="${deleteLabel}" aria-label="${deleteLabel}">${ICONS.delete}</button>` : ""}
          </div>
        </article>`;
    })
    .join("");

  initCardViewers();
}

function initCardViewers() {
  const viewers = $$("#assetCardGrid model-viewer[data-model-src]");
  if (!viewers.length) return;

  const activate = (viewer) => {
    viewer.src = viewer.dataset.modelSrc;
    delete viewer.dataset.modelSrc;
    viewer.addEventListener(
      "error",
      () => {
        const placeholder = document.createElement("div");
        placeholder.className = "viewer-placeholder";
        placeholder.textContent = t("toast.glbFailed");
        viewer.parentElement.appendChild(placeholder);
        viewer.style.display = "none";
      },
      { once: true }
    );
  };

  if (!("IntersectionObserver" in window)) {
    viewers.forEach(activate);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        activate(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "120px" }
  );
  state.cardObserver = observer;
  viewers.forEach((viewer) => observer.observe(viewer));
}

function handleAssetAction(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "image") {
    openImagePreview(target.dataset.url, target.dataset.label);
    return;
  }
  const id = Number(target.dataset.id);
  if (action === "view") openDetail(id);
  if (action === "edit") {
    const asset = state.items.find((item) => item.id === id);
    if (!asset?.can_edit) return;
    const needsCompletion = asset.edit_scope === "full" && !asset.has_glb && asset.status === "待制作";
    openEditor(id, needsCompletion ? "completion" : "edit");
  }
  if (action === "delete") deleteAsset(id);
  if (action === "download") window.location.href = `/api/assets/${id}/download`;
}

function mediaCell(url, label) {
  if (!url) return `<div class="thumb-placeholder" title="${escapeHtml(label)}">◇</div>`;
  const zoomTitle = t("table.clickZoom") + label;
  return `<img class="thumb" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" title="${escapeHtml(zoomTitle)}" data-action="image" data-url="${escapeHtml(url)}" data-label="${escapeHtml(label)}" loading="lazy">`;
}

function openImagePreview(url, label) {
  if (!url) return;
  $("#imagePreviewImg").src = url;
  $("#imagePreviewImg").alt = label;
  $("#imagePreviewTitle").textContent = `${label} · ${t("image.title")}`;
  $("#imagePreviewCaption").textContent = label;
  $("#imagePreviewOpen").href = url;
  $("#imageOverlay").hidden = false;
}

function closeImagePreview() {
  $("#imageOverlay").hidden = true;
  $("#imagePreviewImg").src = "";
}

function setSplitRatio(percent) {
  const split = $("#previewSplit");
  const divider = $("#splitDivider");
  if (!split || !divider) return;
  const value = Math.max(25, Math.min(75, percent));
  split.style.setProperty("--split", `${value}%`);
  divider.setAttribute("aria-valuemin", "25");
  divider.setAttribute("aria-valuemax", "75");
  divider.setAttribute("aria-valuenow", String(Math.round(value)));
  const viewer = $("#modelViewer");
  if (viewer && typeof viewer.resize === "function") viewer.resize();
}

function initSplitDrag() {
  const split = $("#previewSplit");
  const divider = $("#splitDivider");
  let dragging = false;

  const moveTo = (clientX) => {
    const rect = split.getBoundingClientRect();
    if (!rect.width) return;
    setSplitRatio(((clientX - rect.left) / rect.width) * 100);
  };

  divider.addEventListener("pointerdown", (event) => {
    dragging = true;
    divider.classList.add("dragging");
    divider.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  divider.addEventListener("pointermove", (event) => {
    if (dragging) moveTo(event.clientX);
  });
  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove("dragging");
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  };
  divider.addEventListener("pointerup", stopDragging);
  divider.addEventListener("pointercancel", stopDragging);
  divider.addEventListener("keydown", (event) => {
    const current = parseFloat(split.style.getPropertyValue("--split")) || 50;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitRatio(current - 3);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitRatio(current + 3);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setSplitRatio(25);
    }
    if (event.key === "End") {
      event.preventDefault();
      setSplitRatio(75);
    }
  });
}

function revokeObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function clearFiles() {
  revokeObjectUrls();
  state.files = { photo: null, screenshot: null, glb: null };
  state.removed = { photo: false, screenshot: false, glb: false };
  state.existing = { photo_url: "", screenshot_url: "", glb_url: "" };
}

const EMPTY_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='220'%3E%3Crect width='300' height='220' fill='%23eef1f7'/%3E%3C/svg%3E";

function openEditor(id = null, mode = id ? "edit" : "create") {
  clearFiles();
  state.editingId = id;
  state.editorMode = mode;
  $("#assetForm").reset();

  const isCompletion = mode === "completion";
  const isCreate = mode === "create";
  const editingAsset = id ? state.items.find((item) => item.id === id) : null;
  const ownerOnly = editingAsset?.edit_scope === "owner";
  state.ownerOnly = ownerOnly;
  $("#editorModeSwitch").hidden = !id || ownerOnly;
  $$("#editorModeSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.editorMode === mode);
  });
  $("#basicFields").hidden = isCompletion;
  $("#completionContext").hidden = !isCompletion;
  $("#completionFields").hidden = !isCompletion;
  $$(".upload-zone").forEach((zone) => {
    zone.hidden = isCompletion
      ? zone.dataset.field === "photo"
      : isCreate || ownerOnly
        ? zone.dataset.field !== "photo"
        : false;
  });
  refreshEditorLabels();

  if (id) {
    const asset = state.items.find((item) => item.id === id);
    if (!asset) {
      toast(t("toast.notFound"), "error");
      return;
    }
    $("#assetId").value = asset.id;
    $("#nameInput").value = asset.name || "";
    $("#codeInput").value = asset.code || "";
    $("#categoryInput").value = asset.category || "";
    $("#creatorInput").value = asset.creator || "";
    $("#tagsInput").value = asset.tags || "";
    $("#descriptionInput").value = asset.description || "";
    state.existing = {
      photo_url: asset.photo_url || "",
      screenshot_url: asset.screenshot_url || "",
      glb_url: asset.glb_url || "",
      photo_name: asset.photo_name || "",
      screenshot_name: asset.screenshot_name || "",
      glb_name: asset.glb_name || "",
      glb_size: asset.glb_size || 0,
    };

    if (isCompletion) {
      $("#completionReferenceName").textContent = asset.name;
      $("#completionReferencePhoto").src = asset.photo_url || EMPTY_IMAGE;
      $("#completionOpenPhoto").href = asset.photo_url || "#";
      $("#completionOpenPhoto").style.display = asset.photo_url ? "inline-block" : "none";
      $("#completionReferenceMeta").innerHTML = [
        `${t("editor.number")}：${escapeHtml(asset.code || t("table.unnumbered"))}`,
        `${t("editor.creator")}：${escapeHtml(asset.creator || t("common.unknown"))}`,
        `${t("editor.category")}：${escapeHtml(asset.category || t("table.uncategorized"))}`,
        `${t("editor.requirements")}：${escapeHtml(asset.description || t("editor.noRequirements"))}`,
      ]
        .map((line) => `<div>${line}</div>`)
        .join("");
      $("#makerInput").value = asset.maker || "";
    }
  } else {
    $("#assetId").value = "";
    $("#creatorInput").value = "";
    applyCreateDefaults();
  }

  setActivePasteField(null);
  renderAllUploads();
  renderTagSuggest();
  $("#editorOverlay").hidden = false;
  if (isCompletion) {
    setTimeout(() => {
      $("#assetForm").scrollTop = 0;
    }, 0);
  } else {
    setTimeout(() => $("#nameInput").focus(), 60);
  }
}

function closeEditor() {
  $("#editorOverlay").hidden = true;
  state.editorMode = "create";
  clearFiles();
}

function refreshEditorLabels() {
  const mode = state.editorMode;
  const isCompletion = mode === "completion";
  $("#editorTitle").textContent = isCompletion
    ? t("editor.completionTitle")
    : state.editingId
      ? t("editor.editTitle")
      : t("editor.createTitle");
  $("#saveAssetBtn").textContent = isCompletion
    ? t("editor.saveCompletion")
    : state.editingId
      ? t("editor.saveEdit")
      : t("editor.saveCreate");
  $("#fileSectionTitle").querySelector("span").textContent = isCompletion
    ? t("editor.fileCompletion")
    : mode === "create"
      ? t("editor.fileCreate")
      : t("editor.fileEdit");
  $("#fileSectionTitle").querySelector("small").textContent = isCompletion
    ? t("editor.fileCompletionHint")
    : t("editor.fileHint");
  const asset = state.items.find((item) => item.id === state.editingId);
  $("#statusReadonly").textContent = I18N.status(asset?.status || "待制作");
  renderAllUploads();
}

function setActivePasteField(field) {
  state.activePasteField = field;
  $$(".upload-zone").forEach((zone) => {
    zone.classList.toggle("active", zone.dataset.field === field);
  });
}

function renderAllUploads() {
  ["photo", "screenshot", "glb"].forEach(renderUpload);
}

function renderUpload(field) {
  const file = state.files[field];
  const removed = state.removed[field];
  const preview = $(`#${field}Preview`);
  const meta = $(`#${field}Meta`);

  if (field === "glb") {
    preview.textContent = "GLB";
    preview.classList.toggle("ready", Boolean(file));
    if (file) {
      meta.textContent = `${file.name} · ${formatBytes(file.size)}`;
    } else if (!removed && state.existing.glb_url) {
      meta.textContent = `${state.existing.glb_name || t("editor.existingGlb")} · ${formatBytes(state.existing.glb_size)}`;
    } else {
      meta.textContent = t("editor.glbPlaceholder");
    }
    return;
  }

  let url = "";
  if (file) {
    url = URL.createObjectURL(file);
    state.objectUrls.push(url);
  } else if (!removed && state.existing[`${field}_url`]) {
    url = state.existing[`${field}_url`];
  }

  preview.innerHTML = url
    ? `<img src="${escapeHtml(url)}" alt="${t("image.title")}">`
    : `<span>${field === "photo" ? t("editor.photo") : t("editor.screenshot")}</span>`;

  if (file) {
    meta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  } else if (!removed && state.existing[`${field}_url`]) {
    meta.textContent = state.existing[`${field}_name`] || t("editor.existingImage");
  } else {
    meta.textContent = t("editor.noFile");
  }
}

function validateFile(field, file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (field === "glb") {
    if (extension !== "glb") {
      toast(t("toast.invalidGlb"), "error");
      return false;
    }
    return true;
  }
  if (!file.type.startsWith("image/")) {
    toast(t("toast.invalidImage"), "error");
    return false;
  }
  return true;
}

const MAX_IMAGE_EDGE = 1024;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Downscale an image to at most 1024×1024 and re-encode it as WebP (JPEG where
// WebP encoding is unavailable). GIFs are kept as-is so animations survive.
async function compressImage(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await canvasToBlob(canvas, "image/webp", 0.85);
  let extension = "webp";
  if (!blob || blob.type !== "image/webp") {
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    extension = "jpg";
  }
  if (!blob || (scale === 1 && blob.size >= file.size)) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.${extension}`, { type: blob.type, lastModified: Date.now() });
}

function setFile(field, file, quiet = false) {
  if (!file || !validateFile(field, file)) return false;
  revokeObjectUrls();
  state.files[field] = file;
  state.removed[field] = false;
  if (field !== "glb") {
    const original = file;
    state.compressing[field] = compressImage(original)
      .catch(() => original)
      .then((compressed) => {
        if (state.files[field] === original && compressed !== original) {
          state.files[field] = compressed;
          revokeObjectUrls();
          renderAllUploads();
        }
      })
      .finally(() => {
        delete state.compressing[field];
      });
  }
  renderAllUploads();
  if (!quiet) {
    const label =
      field === "glb" ? t("editor.glb") : field === "photo" ? t("editor.photo") : t("editor.screenshot");
    toast(t("toast.ready", { label, name: file.name }));
  }
  return true;
}

function removeFile(field) {
  revokeObjectUrls();
  state.files[field] = null;
  state.removed[field] = true;
  renderAllUploads();
  toast(t("toast.removed"));
}

function distributeFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  let changed = false;

  for (const file of list) {
    const isGlb = file.name.toLowerCase().endsWith(".glb");
    if (isGlb) {
      if (state.ownerOnly || state.editorMode === "create") continue;
      changed = setFile("glb", file, true) || changed;
      continue;
    }
    if (!file.type.startsWith("image/")) continue;

    const imageFields = state.editorMode === "completion"
      ? ["screenshot"]
      : state.editorMode === "create" || state.ownerOnly
        ? ["photo"]
        : ["photo", "screenshot"];
    let target = state.activePasteField;
    if (!imageFields.includes(target)) {
      target =
        imageFields.find(
          (field) =>
            !state.files[field] &&
            !(state.existing[field + "_url"] && !state.removed[field])
        ) || imageFields[0];
    }
    changed = setFile(target, file, true) || changed;
  }

  if (changed) toast(t("toast.imported", { count: list.length }));
  else toast(t("toast.noFiles"), "error");
}

function uploadToStorage(sign, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(sign.fields || {}).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open(sign.method || "POST", sign.url);
    if (sign.url.startsWith("/")) {
      xhr.setRequestHeader("X-Requested-With", "ModelVault");
      xhr.withCredentials = true;
    }
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const code = (xhr.responseText.match(/<Code>([^<]+)<\/Code>/) || [])[1];
      if (code === "EntityTooLarge") reject(new Error(t("error.fileTooLarge")));
      else reject(new Error(t("error.uploadFailed", { message: code || xhr.status })));
    });
    xhr.addEventListener("error", () => reject(new Error(t("error.uploadNetwork"))));
    xhr.addEventListener("abort", () => reject(new Error(t("error.uploadAborted"))));
    xhr.send(form);
  });
}

async function uploadPendingFiles(button) {
  await Promise.all(Object.values(state.compressing));
  const fields = ["photo", "screenshot", "glb"].filter((field) => state.files[field]);
  const totalBytes = fields.reduce((sum, field) => sum + state.files[field].size, 0) || 1;
  let doneBytes = 0;
  const result = {};
  for (const field of fields) {
    const file = state.files[field];
    const sign = await apiFetch("/api/uploads/presign", {
      method: "POST",
      json: { kind: field, filename: file.name, size: file.size },
    });
    await uploadToStorage(sign, file, (loaded) => {
      const percent = Math.min(99, Math.floor(((doneBytes + loaded) / totalBytes) * 100));
      button.textContent = t("editor.uploading", { percent });
    });
    doneBytes += file.size;
    result[field] = { key: sign.key, name: file.name };
  }
  return result;
}

async function saveAsset() {
  const mode = state.editorMode;
  if (mode !== "completion" && !$("#nameInput").value.trim()) {
    toast(t("toast.nameRequired"), "error");
    $("#nameInput").focus();
    return;
  }

  const payload = {};
  if (mode !== "completion") {
    payload.name = $("#nameInput").value.trim();
    payload.code = $("#codeInput").value.trim();
    payload.creator = $("#creatorInput").value.trim();
    payload.category = $("#categoryInput").value.trim();
    payload.tags = $("#tagsInput").value.trim();
    payload.description = $("#descriptionInput").value.trim();
  } else {
    payload.maker = $("#makerInput").value.trim();
  }

  const button = $("#saveAssetBtn");
  button.disabled = true;
  button.textContent = t("editor.saving");
  try {
    const uploaded = await uploadPendingFiles(button);
    ["photo", "screenshot", "glb"].forEach((field) => {
      if (uploaded[field]) payload[field] = uploaded[field];
      else if (state.removed[field]) payload[field] = null;
    });
    button.textContent = t("editor.saving");
    const url = state.editingId ? `/api/assets/${state.editingId}` : "/api/assets";
    await apiFetch(url, { method: state.editingId ? "PUT" : "POST", json: payload });
    toast(
      mode === "completion"
        ? t("toast.savedCompletion")
        : state.editingId
          ? t("toast.updated")
          : t("toast.created")
    );
    closeEditor();
    await loadAssets();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = mode === "completion"
      ? t("editor.saveCompletion")
      : state.editingId
        ? t("editor.saveEdit")
        : t("editor.saveCreate");
  }
}

function openDetail(id) {
  const asset = state.items.find((item) => item.id === id);
  if (!asset) {
    toast(t("toast.notFound"), "error");
    return;
  }

  const viewer = $("#modelViewer");
  const placeholder = $("#viewerPlaceholder");
  const loading = $("#viewerLoading");
  state.detailId = id;
  const detailPhoto = $("#detailPhoto");
  if (asset.photo_url) {
    detailPhoto.src = asset.photo_url;
    detailPhoto.hidden = false;
    $("#detailPhotoPlaceholder").hidden = true;
  } else {
    detailPhoto.src = "";
    detailPhoto.hidden = true;
    $("#detailPhotoPlaceholder").hidden = false;
  }
  setSplitRatio(50);
  $("#detailTitle").textContent = asset.name;
  $("#detailDownloadBtn").href = asset.has_glb ? `/api/assets/${asset.id}/download` : "#";
  $("#detailDownloadBtn").style.display = asset.has_glb ? "inline-flex" : "none";
  $("#detailInfo").innerHTML = `
    <h3>${escapeHtml(asset.name)}</h3>
    <div class="info-code">${escapeHtml(asset.code || t("table.unnumbered"))}</div>
    <div class="info-list">
      <div class="info-row"><span>${t("detail.category")}</span><span>${escapeHtml(asset.category || t("table.uncategorized"))}</span></div>
      <div class="info-row"><span>${t("table.status")}</span><span>${escapeHtml(I18N.status(asset.status))}</span></div>
      <div class="info-row"><span>${t("detail.creator")}</span><span>${escapeHtml(asset.creator || t("common.unknown"))}</span></div>
      <div class="info-row"><span>${t("detail.maker")}</span><span>${escapeHtml(asset.maker || t("common.unknown"))}</span></div>
      <div class="info-row"><span>${t("detail.tags")}</span><span>${escapeHtml(asset.tags || t("common.none"))}</span></div>
      <div class="info-row"><span>${t("detail.glbSize")}</span><span>${formatBytes(asset.glb_size)}</span></div>
      <div class="info-row"><span>${t("detail.createdAt")}</span><span>${escapeHtml(asset.created_at)}</span></div>
      <div class="info-row"><span>${t("detail.completedAt")}</span><span>${escapeHtml(asset.completed_at || t("common.none"))}</span></div>
      <div class="info-row"><span>${t("detail.updatedAt")}</span><span>${escapeHtml(asset.updated_at)}</span></div>
    </div>
    <div class="info-desc"><h4>${t("detail.description")}</h4><p>${escapeHtml(asset.description || t("detail.noDescription"))}</p></div>
    ${
      asset.photo_url || asset.screenshot_url
        ? `<div class="detail-images">${[
            asset.photo_url ? `<img src="${escapeHtml(asset.photo_url)}" alt="${t("editor.photo")}">` : "",
            asset.screenshot_url ? `<img src="${escapeHtml(asset.screenshot_url)}" alt="${t("editor.screenshot")}">` : "",
          ].join("")}</div>`
        : ""
    }`;

  viewer.src = "";
  if (asset.glb_url) {
    placeholder.hidden = true;
    loading.hidden = false;
    viewer.src = asset.glb_url;
  } else {
    placeholder.hidden = false;
    loading.hidden = true;
  }
  $("#detailOverlay").hidden = false;
}

function closeDetail() {
  $("#detailOverlay").hidden = true;
  $("#modelViewer").src = "";
}

async function deleteAsset(id) {
  const asset = state.items.find((item) => item.id === id);
  if (!asset) return;
  if (!window.confirm(t("confirm.delete", { name: asset.name }))) return;
  try {
    await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
    toast(t("toast.deleted"));
    await loadAssets();
  } catch (error) {
    toast(error.message, "error");
  }
}

function bindEvents() {
  $("#createBtn").addEventListener("click", () => openEditor());
  $("#emptyCreateBtn").addEventListener("click", () => openEditor());
  $("#refreshBtn").addEventListener("click", () => {
    loadAssets();
    toast(t("toast.refreshed"));
  });
  $("#closeEditorBtn").addEventListener("click", closeEditor);
  $("#cancelEditorBtn").addEventListener("click", closeEditor);
  $("#saveAssetBtn").addEventListener("click", saveAsset);
  $("#editorOverlay").addEventListener("mousedown", (event) => {
    if (event.target.id === "editorOverlay") closeEditor();
  });

  $("#assetForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveAsset();
  });

  let debounceTimer;
  $("#searchInput").addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reloadFromFirstPage, 250);
  });
  ["#categoryFilter", "#statusFilter", "#sortSelect"].forEach((selector) => {
    $(selector).addEventListener("change", reloadFromFirstPage);
  });
  $("#tagBarList").addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-tag]");
    if (!chip) return;
    const tag = chip.dataset.tag;
    const input = $("#searchInput");
    input.value = input.value.trim().toLowerCase() === tag.toLowerCase() ? "" : tag;
    renderTagBar();
    reloadFromFirstPage();
  });
  $("#tagSuggest").addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-tag]");
    if (chip) toggleEditorTag(chip.dataset.tag);
  });
  $("#tagsInput").addEventListener("input", renderTagSuggest);
  $("#resetFilterBtn").addEventListener("click", () => {
    $("#searchInput").value = "";
    $("#categoryFilter").value = "";
    $("#statusFilter").value = "";
    $("#sortSelect").value = "created_desc";
    reloadFromFirstPage();
  });
  $("#pagerControls").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (button && !button.disabled) goToPage(Number(button.dataset.page));
  });
  $("#pageSizeSelect").addEventListener("change", (event) => {
    state.pageSize = PAGE_SIZES.includes(Number(event.target.value)) ? Number(event.target.value) : 20;
    try {
      localStorage.setItem("asset_page_size", String(state.pageSize));
    } catch {
      // Storage may be unavailable; the choice still applies for this visit.
    }
    reloadFromFirstPage();
  });

  $("#assetTableBody").addEventListener("click", handleAssetAction);
  $("#assetCardGrid").addEventListener("click", handleAssetAction);
  $("#viewSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    state.viewMode = button.dataset.view === "card" ? "card" : "table";
    localStorage.setItem("asset_view", state.viewMode);
    renderAssets();
  });

  $("#editorModeSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-editor-mode]");
    if (!button || !state.editingId) return;
    openEditor(state.editingId, button.dataset.editorMode);
  });

  $("#closeImageBtn").addEventListener("click", closeImagePreview);
  $("#imageOverlay").addEventListener("mousedown", (event) => {
    if (event.target.id === "imageOverlay") closeImagePreview();
  });

  $$(".upload-zone").forEach((zone) => {
    const field = zone.dataset.field;
    zone.addEventListener("click", (event) => {
      if (event.target.closest("[data-remove]") || event.target.closest("[data-pick]")) return;
      setActivePasteField(field);
    });
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActivePasteField(field);
      }
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragover");
      setActivePasteField(field);
      if (event.dataTransfer?.files?.length) {
        if (field === "glb") setFile("glb", event.dataTransfer.files[0]);
        else distributeFiles(event.dataTransfer.files);
      }
    });
  });

  $$("[data-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.pick;
      setActivePasteField(field);
      $(`#${field}Input`).click();
    });
  });
  $$("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFile(button.dataset.remove));
  });

  $("#photoInput").addEventListener("change", (event) => {
    if (event.target.files[0]) setFile("photo", event.target.files[0]);
    event.target.value = "";
  });
  $("#screenshotInput").addEventListener("change", (event) => {
    if (event.target.files[0]) setFile("screenshot", event.target.files[0]);
    event.target.value = "";
  });
  $("#glbInput").addEventListener("change", (event) => {
    if (event.target.files[0]) setFile("glb", event.target.files[0]);
    event.target.value = "";
  });

  document.addEventListener("paste", (event) => {
    let files = Array.from(event.clipboardData?.files || []);
    if (!files.length) {
      files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(Boolean);
    }
    if (!files.length) return;

    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (isTyping && !files.some((file) => file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".glb"))) {
      return;
    }
    if ($("#editorOverlay").hidden) {
      if (!can("create") || !$("#accountOverlay").hidden) return;
      event.preventDefault();
      openEditor();
    } else {
      event.preventDefault();
    }
    distributeFiles(files);
  });

  $("#closeDetailBtn").addEventListener("click", closeDetail);
  $("#detailCloseBtn").addEventListener("click", closeDetail);
  $("#detailOverlay").addEventListener("mousedown", (event) => {
    if (event.target.id === "detailOverlay") closeDetail();
  });
  initSplitDrag();

  const viewer = $("#modelViewer");
  viewer.addEventListener("load", () => {
    $("#viewerLoading").hidden = true;
  });
  viewer.addEventListener("error", () => {
    $("#viewerLoading").hidden = true;
    toast(t("toast.glbFailed"), "error");
  });

  $("#langSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-lang]");
    if (button) setLanguage(button.dataset.lang);
  });

  $("#helpBtn").addEventListener("click", () => {
    $("#helpOverlay").hidden = false;
  });
  $("#closeHelpBtn").addEventListener("click", () => {
    $("#helpOverlay").hidden = true;
  });
  $("#helpCloseBtn").addEventListener("click", () => {
    $("#helpOverlay").hidden = true;
  });
  $("#helpOverlay").addEventListener("mousedown", (event) => {
    if (event.target.id === "helpOverlay") $("#helpOverlay").hidden = true;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#accountOverlay").hidden) closeAccount();
    else if (!$("#imageOverlay").hidden) closeImagePreview();
    else if (!$("#helpOverlay").hidden) $("#helpOverlay").hidden = true;
    else if (!$("#detailOverlay").hidden) closeDetail();
    else if (!$("#editorOverlay").hidden) closeEditor();
  });
}

// ------------------------------------------------------------------ account

function renderUser() {
  const user = state.user;
  if (!user) return;
  const name = user.display_name || user.username;
  $("#userAvatar").textContent = name.slice(0, 1).toUpperCase();
  $("#userName").textContent = name;
  $("#userRole").textContent = user.is_admin ? t("role.admin") : t("role.user");
  $("#adminLink").hidden = !user.is_admin;
  const perms = user.permissions || {};
  const labels = ["create", "edit", "delete"]
    .filter((perm) => perms[perm])
    .map((perm) => t(`perm.${perm}`));
  $("#userPerms").textContent = labels.length ? `${t("perm.viewDownload")} · ${labels.join(" · ")}` : t("perm.viewOnly");
  $("#createBtn").hidden = !can("create");
  $("#emptyCreateBtn").hidden = !can("create");
}

function toggleUserMenu(force) {
  const menu = $("#userMenu");
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  $("#userButton").setAttribute("aria-expanded", String(open));
}

function openAccount() {
  toggleUserMenu(false);
  $("#profileNameInput").value = state.user?.display_name || "";
  $("#accountUsername").textContent = state.user?.username || "";
  ["#oldPasswordInput", "#newPasswordInput", "#confirmPasswordInput"].forEach((sel) => {
    $(sel).value = "";
  });
  $("#accountOverlay").hidden = false;
}

function closeAccount() {
  $("#accountOverlay").hidden = true;
}

async function saveProfile() {
  const displayName = $("#profileNameInput").value.trim();
  if (!displayName) {
    toast(t("account.nameRequired"), "error");
    return;
  }
  try {
    const data = await apiFetch("/api/auth/profile", { method: "PUT", json: { display_name: displayName } });
    state.user = data.user;
    renderUser();
    toast(t("account.profileSaved"));
  } catch (error) {
    toast(error.message, "error");
  }
}

async function savePassword() {
  const oldPassword = $("#oldPasswordInput").value;
  const newPassword = $("#newPasswordInput").value;
  if (newPassword !== $("#confirmPasswordInput").value) {
    toast(t("auth.passwordMismatch"), "error");
    return;
  }
  try {
    await apiFetch("/api/auth/password", {
      method: "POST",
      json: { old_password: oldPassword, new_password: newPassword },
    });
    toast(t("account.passwordSaved"));
    closeAccount();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    location.href = "/login.html";
  }
}

function bindAccountEvents() {
  $("#userButton").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleUserMenu();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#userMenu")) toggleUserMenu(false);
  });
  $("#accountBtn").addEventListener("click", openAccount);
  $("#logoutBtn").addEventListener("click", logout);
  $("#closeAccountBtn").addEventListener("click", closeAccount);
  $("#accountOverlay").addEventListener("mousedown", (event) => {
    if (event.target.id === "accountOverlay") closeAccount();
  });
  $("#saveProfileBtn").addEventListener("click", saveProfile);
  $("#savePasswordBtn").addEventListener("click", savePassword);
}

async function boot() {
  applyStaticI18n();
  try {
    const data = await apiFetch("/api/auth/me");
    state.user = data.user;
  } catch {
    return;
  }
  document.body.classList.remove("booting");
  renderUser();
  bindEvents();
  bindAccountEvents();
  loadAssets();
}

boot();
