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
  editingAsset: null,
  editorReturn: null,
  editorSaving: false,
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
  method: "",
  editMethod: null,
  selected: new Set(),
  opt: null,
  detailVersion: "opt",
  detailVersionFor: null,
  page: 1,
  pageSize: savedPageSize(),
  pagination: null,
};

const ICONS = {
  optimize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m8.5 10.5 3.5 2 3.5-2M12 12.5V17"/><path d="M4 4l3 3M20 4l-3 3"/></svg>`,
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
  renderMethodTabs();
  renderBatchBar();
  renderMethodPicker();
  renderTagSuggest();
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
    const error = new Error(I18N.serverError(message));
    error.status = response.status;
    throw error;
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
  if (state.method) params.set("method", state.method);
  const optimized = $("#optimizedFilter").value;
  if (optimized) params.set("optimized", optimized);
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
    state.selected.clear();
    renderPager();
    renderMethodTabs();
    renderBatchBar();
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
    {
      label: t("stat.total"),
      value: stats.total ?? 0,
      note: stats.methods ? t("stat.methodNote", stats.methods) : t("stat.totalNote"),
      color: "var(--primary-soft)",
    },
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
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(termLabel(category))}</option>`)
    .join("")}`;
  categorySelect.value = categories.includes(previous) ? previous : "";
  $("#categoryOptions").innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
  renderTagBar();
}

const METHODS = ["ai", "manual", "hybrid"];

function methodBadge(method) {
  const key = METHODS.includes(method) ? method : "ai";
  return `<span class="method-badge" data-method="${key}" title="${escapeHtml(t(`method.${key}`))}">${escapeHtml(t(`method.short.${key}`))}</span>`;
}

// Tabs above the toolbar: 全部 / AI 生成 / 手动建模 / AI + 人工修整, with counts.
function renderMethodTabs() {
  const counts = state.stats.methods || {};
  const tabs = [["", t("method.all"), state.stats.total ?? 0], ...METHODS.map((m) => [m, t(`method.${m}`), counts[m] || 0])];
  $("#methodTabs").innerHTML = tabs
    .map(([value, label, count]) => {
      const active = value === state.method;
      return `<button type="button" role="tab" aria-selected="${active}" class="method-tab ${active ? "active" : ""}" data-method="${value}">${value ? `<span class="method-dot" data-method="${value}"></span>` : ""}${escapeHtml(label)}<span class="method-count">${count}</span></button>`;
    })
    .join("");
}

function canBatch() {
  return can("edit") && state.viewMode === "table";
}

function renderBatchBar() {
  const count = state.selected.size;
  $("#batchBar").hidden = !canBatch() || count === 0;
  $("#batchInfo").textContent = t("batch.selected", { count });
  const box = $("#selectAllBox");
  if (box) {
    const ids = state.items.map((item) => item.id);
    const chosen = ids.filter((id) => state.selected.has(id)).length;
    box.checked = ids.length > 0 && chosen === ids.length;
    box.indeterminate = chosen > 0 && chosen < ids.length;
  }
}

async function applyBatchMethod(method) {
  const ids = [...state.selected];
  if (!ids.length) return;
  try {
    const result = await apiFetch("/api/assets/batch-method", { method: "POST", json: { ids, method } });
    toast(t("batch.done", { count: result.updated, method: t(`method.${method}`) }));
    await loadAssets();
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderMethodPicker() {
  const method = state.editMethod;
  $$("#methodPicker button[data-method]").forEach((button) => {
    const active = button.dataset.method === method;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  $("#aiToolRow").hidden = !method || method === "manual";
  $("#aiToolOptions").innerHTML = (state.stats.aiTools || [])
    .map((tool) => `<option value="${escapeHtml(tool)}"></option>`)
    .join("");
}

// 术语翻译: tags and categories are stored in Chinese; the English UI shows the
// admin-maintained English name when one exists, otherwise the original text.
function termLabel(term) {
  const text = String(term ?? "");
  if (I18N.current !== "en") return text;
  return (state.stats.terms || {})[text] || text;
}

function termHtml(term) {
  const label = termLabel(term);
  const title = label !== term ? ` title="${escapeHtml(term)}"` : "";
  return `<span${title}>${escapeHtml(label)}</span>`;
}

function tagListHtml(text) {
  return splitTags(text).map(termLabel).join(", ");
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
      const label = termLabel(tag);
      const active = tag.toLowerCase() === current || label.toLowerCase() === current;
      const title = label !== tag ? ` title="${escapeHtml(tag)}"` : "";
      return `<button type="button" class="tag-chip ${active ? "active" : ""}" data-tag="${escapeHtml(tag)}" data-label="${escapeHtml(label)}" aria-pressed="${active}"${title}>${escapeHtml(label)}<small>${count}</small></button>`;
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
      const label = termLabel(tag);
      const title = label !== tag ? ` title="${escapeHtml(tag)}"` : "";
      return `<button type="button" class="tag-chip ${active ? "active" : ""}" data-tag="${escapeHtml(tag)}" aria-pressed="${active}"${title}>${escapeHtml(label)}</button>`;
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
  const batch = canBatch();
  $("#selectAllCell").hidden = !batch;

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
        <tr class="${state.selected.has(item.id) ? "selected" : ""}">
          ${batch ? `<td class="col-check"><input type="checkbox" data-select="${item.id}" aria-label="Select" ${state.selected.has(item.id) ? "checked" : ""}></td>` : ""}
          <td>${mediaCell(item.photo_url, previewLabel)}</td>
          <td>${mediaCell(item.screenshot_url, screenshotLabel)}</td>
          <td>
            <div class="asset-name">${escapeHtml(item.name)}</div>
            <div class="asset-code">${item.code ? escapeHtml(item.code) : t("table.unnumbered")}${people ? ` · ${escapeHtml(people)}` : ""}</div>
          </td>
          <td>
            <div class="category-text">${item.category ? termHtml(item.category) : `<span class="muted">${t("table.uncategorized")}</span>`}</div>
            ${tags.length ? `<div class="tag-list">${tags.map((tag) => `<span class="tag"${termLabel(tag) !== tag ? ` title="${escapeHtml(tag)}"` : ""}>${escapeHtml(termLabel(tag))}</span>`).join("")}</div>` : ""}
          </td>
          <td><div class="status-stack">${methodBadge(item.method)}<span class="status-chip" data-status="${escapeHtml(item.status)}">${escapeHtml(I18N.status(item.status))}</span></div></td>
          <td>
            ${
              item.glb_url
                ? `<div class="file-pill"><span class="file-dot"></span><div><strong>${escapeHtml(item.glb_name || "model.glb")}</strong><br>${formatBytes(item.glb_size)}</div></div>${optBadge(item)}`
                : `<span class="muted">${t("table.noModel")}</span>`
            }
          </td>
          <td class="muted">${escapeHtml(item.updated_at || "")}</td>
          <td>
            <div class="row-actions">
              <button class="action-btn view" type="button" data-action="view" data-id="${item.id}" title="${viewLabel}" aria-label="${viewLabel}">${ICONS.view}</button>
              ${item.can_edit ? `<button class="action-btn edit" type="button" data-action="edit" data-id="${item.id}" title="${editLabel}" aria-label="${editLabel}">${ICONS.edit}</button>` : ""}
              ${canOptimize(item) ? `<button class="action-btn optimize" type="button" data-action="optimize" data-id="${item.id}" title="${escapeHtml(t("opt.open"))}" aria-label="${escapeHtml(t("opt.open"))}">${ICONS.optimize}</button>` : ""}
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
        ? `<model-viewer data-model-src="${escapeHtml(item.glb_opt_url || item.glb_url)}" alt="${escapeHtml(item.name)}" loading="lazy" camera-controls auto-rotate auto-rotate-delay="0" rotation-per-second="24deg" shadow-intensity="1" exposure="1" environment-image="/static/env/studio.hdr" interaction-prompt="none"></model-viewer>
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
            <div class="card-meta">${item.code ? escapeHtml(item.code) : t("table.unnumbered")} · ${formatBytes(item.has_opt ? item.glb_opt_size : item.glb_size)}</div>
            ${optBadge(item)}
            <div class="card-row">
              <span class="status-stack">${methodBadge(item.method)}<span class="status-chip" data-status="${escapeHtml(item.status)}">${escapeHtml(I18N.status(item.status))}</span></span>
              <span class="card-time">${escapeHtml(item.updated_at || "")}</span>
            </div>
            ${tags.length ? `<div class="tag-list">${tags.map((tag) => `<span class="tag"${termLabel(tag) !== tag ? ` title="${escapeHtml(tag)}"` : ""}>${escapeHtml(termLabel(tag))}</span>`).join("")}</div>` : ""}
          </div>
          <div class="card-footer">
            <button class="action-btn view" type="button" data-action="view" data-id="${item.id}" title="${viewLabel}" aria-label="${viewLabel}">${ICONS.view}</button>
            ${item.can_edit ? `<button class="action-btn edit" type="button" data-action="edit" data-id="${item.id}" title="${editLabel}" aria-label="${editLabel}">${ICONS.edit}</button>` : ""}
            ${canOptimize(item) ? `<button class="action-btn optimize" type="button" data-action="optimize" data-id="${item.id}" title="${escapeHtml(t("opt.open"))}" aria-label="${escapeHtml(t("opt.open"))}">${ICONS.optimize}</button>` : ""}
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
  if (action === "optimize") openOptimizer(id);
  if (action === "download") downloadAsset(id);
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

function assetEndpoint(asset) {
  return asset.deleted_at ? `/api/assets/trash/${asset.id}` : `/api/assets/${asset.id}`;
}

function openEditor(id = null, mode = id ? "edit" : "create", context) {
  if (state.editorSaving) return;
  const asset = context?.asset ?? state.items.find((item) => item.id === id);
  if (id && !asset) {
    toast(t("toast.notFound"), "error");
    return;
  }
  clearFiles();
  state.editingId = id;
  state.editingAsset = asset;
  state.editorReturn = context?.onClose;
  state.editorMode = mode;
  $("#assetForm").reset();

  const isCompletion = mode === "completion";
  const isCreate = mode === "create";
  const ownerOnly = asset?.edit_scope === "owner";
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
    $("#assetId").value = asset.id;
    $("#nameInput").value = asset.name || "";
    $("#codeInput").value = asset.code || "";
    $("#categoryInput").value = asset.category || "";
    $("#creatorInput").value = asset.creator || "";
    $("#tagsInput").value = asset.tags || "";
    state.editMethod = asset.method || "ai";
    $("#aiToolInput").value = asset.ai_tool || "";
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
        `${t("editor.category")}：${escapeHtml(asset.category ? termLabel(asset.category) : t("table.uncategorized"))}`,
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
    state.editMethod = null; // a new task must choose 制作方式 explicitly
  }

  setActivePasteField(null);
  renderAllUploads();
  renderTagSuggest();
  renderMethodPicker();
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
  if (state.editorSaving) return;
  const onClose = state.editorReturn;
  state.editorReturn = null;
  $("#editorOverlay").hidden = true;
  state.editorMode = "create";
  clearFiles();
  onClose?.();
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
  const asset = state.editingAsset;
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
  if (state.editorSaving) return;
  const asset = state.editingAsset;
  const mode = state.editorMode;
  if (mode !== "completion" && !$("#nameInput").value.trim()) {
    toast(t("toast.nameRequired"), "error");
    $("#nameInput").focus();
    return;
  }

  if (mode !== "completion" && !state.editMethod) {
    toast(t("method.required"), "error");
    $("#methodField").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#methodPicker").classList.add("invalid");
    return;
  }

  const payload = {};
  if (mode !== "completion") {
    payload.method = state.editMethod;
    payload.ai_tool = state.editMethod === "manual" ? "" : $("#aiToolInput").value.trim();
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
  state.editorSaving = button.disabled = true;
  button.textContent = t("editor.saving");
  try {
    const uploaded = await uploadPendingFiles(button);
    ["photo", "screenshot", "glb"].forEach((field) => {
      if (uploaded[field]) payload[field] = uploaded[field];
      else if (state.removed[field]) payload[field] = null;
    });
    button.textContent = t("editor.saving");
    const url = asset ? assetEndpoint(asset) : "/api/assets";
    await apiFetch(url, { method: state.editingId ? "PUT" : "POST", json: payload });
    toast(
      mode === "completion"
        ? t("toast.savedCompletion")
        : state.editingId
          ? t("toast.updated")
          : t("toast.created")
    );
    state.editorSaving = false;
    closeEditor();
    if (!asset?.deleted_at) await loadAssets();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.editorSaving = button.disabled = false;
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
  $("#detailDownloadBtn").textContent = t("detail.download");
  $("#detailOptimizeBtn").hidden = !canOptimize(asset);
  $("#detailOptimizeBtn").textContent = asset.has_opt ? t("opt.reopen") : t("opt.open");
  $("#detailDeleteOptBtn").hidden = !(asset.has_opt && canOptimize(asset));
  if (state.detailVersionFor !== asset.id) {
    state.detailVersion = "opt";
    state.detailVersionFor = asset.id;
  }
  $("#detailInfo").innerHTML = `
    <h3>${escapeHtml(asset.name)}</h3>
    <div class="info-code">${escapeHtml(asset.code || t("table.unnumbered"))}</div>
    <div class="info-list">
      <div class="info-row"><span>${t("detail.category")}</span><span>${escapeHtml(asset.category ? termLabel(asset.category) : t("table.uncategorized"))}</span></div>
      <div class="info-row"><span>${t("table.status")}</span><span>${escapeHtml(I18N.status(asset.status))}</span></div>
      <div class="info-row"><span>${t("method.label")}</span><span>${methodBadge(asset.method)} ${escapeHtml(t(`method.${METHODS.includes(asset.method) ? asset.method : "ai"}`))}</span></div>
      ${asset.ai_tool ? `<div class="info-row"><span>${t("detail.aiTool")}</span><span>${escapeHtml(asset.ai_tool)}</span></div>` : ""}
      <div class="info-row"><span>${t("detail.creator")}</span><span>${escapeHtml(asset.creator || t("common.unknown"))}</span></div>
      <div class="info-row"><span>${t("detail.maker")}</span><span>${escapeHtml(asset.maker || t("common.unknown"))}</span></div>
      <div class="info-row"><span>${t("detail.tags")}</span><span>${escapeHtml(tagListHtml(asset.tags) || t("common.none"))}</span></div>
      <div class="info-row"><span>${t("detail.glbSize")}</span><span>${formatBytes(asset.glb_size)}</span></div>
      ${asset.has_opt ? `<div class="info-row"><span>${t("opt.label")}</span><span>${escapeHtml(optSummary(asset))}</span></div>` : ""}
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
  $("#versionSwitch").hidden = !asset.has_opt;
  $$("#versionSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.version === state.detailVersion);
  });
  if (asset.glb_url) {
    placeholder.hidden = true;
    loading.hidden = false;
    viewer.src = asset.has_opt && state.detailVersion === "opt" ? asset.glb_opt_url : asset.glb_url;
  } else {
    placeholder.hidden = false;
    loading.hidden = true;
  }
  $("#detailOverlay").hidden = false;
}

// ------------------------------------------------------------------ MeshPilot 减面优化

const OPT_DEFAULT_RATIO = 50;
const OPT_DEFAULT_ERROR = 2; // %: the error limit has to grow with the ratio or presets barely differ

function canOptimize(item) {
  return Boolean(item?.has_glb && item.edit_scope === "full");
}

function formatCount(value) {
  return Number(value || 0).toLocaleString(I18N.current === "en" ? "en-US" : "zh-CN");
}

function reductionPercent(before, after) {
  return before && after ? Math.round((1 - after / before) * 100) : 0;
}

function optSummary(item) {
  const sizes = t("opt.sizes", { size: formatBytes(item.glb_opt_size), original: formatBytes(item.glb_size) });
  if (!item.tri_before || !item.tri_after) return sizes;
  return `${t("opt.triangles", { before: formatCount(item.tri_before), after: formatCount(item.tri_after) })} · ${sizes}`;
}

function optBadge(item) {
  if (!item.has_opt) return "";
  const percent = reductionPercent(item.tri_before, item.tri_after);
  const label = percent ? t("opt.badge", { percent }) : t("opt.badgePlain");
  return `<div class="opt-badge" title="${escapeHtml(optSummary(item))}"><span>${escapeHtml(label)}</span>${escapeHtml(formatBytes(item.glb_opt_size))}</div>`;
}

function optimizerMessage(message, transfer) {
  $("#optFrame").contentWindow?.postMessage({ target: "meshpilot", ...message }, location.origin, transfer);
}

function setOptimizerBusy(busy) {
  state.opt.busy = busy;
  $("#optSaveBtn").disabled = busy || !state.opt.counts?.after || state.opt.saving;
  $$("#optPresets button").forEach((button) => {
    button.disabled = busy || !state.opt.loaded || state.opt.saving;
  });
}

function renderOptimizerResult() {
  const { counts, error } = state.opt;
  const box = $("#optResult");
  box.classList.toggle("error", Boolean(error));
  if (error) {
    box.textContent = error;
  } else if (counts?.after) {
    box.textContent = t("opt.result", {
      before: formatCount(counts.before),
      after: formatCount(counts.after),
      percent: reductionPercent(counts.before, counts.after),
    });
  } else {
    box.textContent = t("opt.loading");
  }
  $$("#optPresets button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.ratio) === state.opt.ratio);
  });
}

function openOptimizer(id, context) {
  const asset = context?.asset ?? state.items.find((item) => item.id === id);
  if (!canOptimize(asset)) return;
  state.opt = { asset, onClose: context?.onClose, ratio: OPT_DEFAULT_RATIO, errorLimit: OPT_DEFAULT_ERROR, loaded: false, busy: true, saving: false, counts: null, error: "", dirty: false };
  $("#optAssetName").textContent = asset.name;
  $("#optOriginal").textContent = t("opt.original", { name: asset.glb_name || "model.glb", size: formatBytes(asset.glb_size) });
  $("#optSaveBtn").textContent = t("opt.save");
  renderOptimizerResult();
  setOptimizerBusy(true);
  // Always start from the original GLB so quality never degrades across repeated optimizations.
  $("#optFrame").src = `/meshpilot/index.html?embed=1&lang=${I18N.current}&t=${Date.now()}`;
  $("#optOverlay").hidden = false;
}

function closeOptimizer(force = false) {
  if (!state.opt) return;
  if (state.opt.saving) return;
  if (!force && state.opt.dirty && !window.confirm(t("opt.confirmClose"))) return;
  $("#optOverlay").hidden = true;
  $("#optFrame").src = "about:blank";
  const onClose = state.opt.onClose;
  state.opt = null;
  onClose?.();
}

function handleOptimizerMessage(event) {
  if (!state.opt || event.origin !== location.origin || event.source !== $("#optFrame").contentWindow) return;
  const data = event.data || {};
  if (data.source !== "meshpilot") return;
  const opt = state.opt;
  if (data.type === "ready") {
    optimizerMessage({ type: "load", url: opt.asset.glb_url, name: opt.asset.glb_name || "model.glb", ratio: opt.ratio, error: opt.errorLimit });
  } else if (data.type === "busy") {
    setOptimizerBusy(data.busy);
  } else if (data.type === "loaded" || data.type === "result") {
    opt.loaded = true;
    opt.error = "";
    opt.counts = data;
    if (data.type === "result") opt.dirty = true;
    renderOptimizerResult();
    setOptimizerBusy(opt.busy);
  } else if (data.type === "error") {
    if (opt.saving) finishSave(false);
    opt.error = data.message || t("opt.failed");
    renderOptimizerResult();
    toast(opt.error, "error");
  } else if (data.type === "exported") {
    uploadOptimized(data);
  }
}

async function saveOptimized() {
  const opt = state.opt;
  if (!opt || opt.busy || opt.saving || !opt.counts?.after) return;
  opt.saving = true;
  setOptimizerBusy(true);
  $("#optSaveBtn").textContent = t("opt.exporting");
  optimizerMessage({ type: "export" });
}

function finishSave(ok) {
  if (!state.opt) return;
  state.opt.saving = false;
  $("#optSaveBtn").textContent = t("opt.save");
  setOptimizerBusy(state.opt.busy);
  if (ok) {
    state.opt.dirty = false;
    closeOptimizer(true);
  }
}

async function uploadOptimized(data) {
  const opt = state.opt;
  if (!opt) return;
  const button = $("#optSaveBtn");
  try {
    const base = (opt.asset.glb_name || "model.glb").replace(/\.glb$/i, "");
    const file = new File([data.buffer], `${base}-optimized.glb`, { type: "model/gltf-binary" });
    const sign = await apiFetch("/api/uploads/presign", {
      method: "POST",
      json: { kind: "glb", filename: file.name, size: file.size },
    });
    await uploadToStorage(sign, file, (loaded, total) => {
      button.textContent = t("editor.uploading", { percent: Math.min(99, Math.floor((loaded / total) * 100)) });
    });
    button.textContent = t("editor.saving");
    await apiFetch(`${assetEndpoint(opt.asset)}/optimized`, {
      method: "POST",
      json: { key: sign.key, triangles_before: data.before, triangles_after: data.after },
    });
    toast(t("opt.saved", { percent: reductionPercent(data.before, data.after), size: formatBytes(file.size) }));
    finishSave(true);
    if (!opt.asset.deleted_at) await loadAssets();
  } catch (error) {
    toast(error.message, "error");
    finishSave(false);
  }
}

async function deleteOptimized() {
  const asset = state.items.find((item) => item.id === state.detailId);
  if (!asset?.has_opt || !window.confirm(t("opt.confirmDelete", { name: asset.name }))) return;
  try {
    await apiFetch(`/api/assets/${asset.id}/optimized`, { method: "DELETE" });
    toast(t("opt.deleted"));
    await loadAssets();
    state.detailVersion = "opt";
    openDetail(asset.id);
  } catch (error) {
    toast(error.message, "error");
  }
}

function bindOptimizerEvents() {
  window.addEventListener("message", handleOptimizerMessage);
  $("#optPresets").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-ratio]");
    if (!button || !state.opt || state.opt.busy) return;
    state.opt.ratio = Number(button.dataset.ratio);
    state.opt.errorLimit = Number(button.dataset.error);
    state.opt.error = "";
    renderOptimizerResult();
    optimizerMessage({ type: "preset", ratio: state.opt.ratio, error: state.opt.errorLimit });
  });
  $("#optSaveBtn").addEventListener("click", saveOptimized);
  $("#optCancelBtn").addEventListener("click", () => closeOptimizer());
  $("#optCloseBtn").addEventListener("click", () => closeOptimizer());
}

// When an optimized version exists, every download asks which version to get.
function downloadAsset(id) {
  const asset = state.items.find((item) => item.id === id);
  if (!asset?.has_glb) return;
  if (!asset.has_opt) {
    window.location.href = `/api/assets/${id}/download?version=original`;
    return;
  }
  $("#downloadAssetName").textContent = asset.name;
  $("#downloadOptimizedLink").href = `/api/assets/${id}/download?version=optimized`;
  $("#downloadOriginalLink").href = `/api/assets/${id}/download?version=original`;
  const percent = reductionPercent(asset.tri_before, asset.tri_after);
  $("#downloadOptimizedInfo").textContent = [
    formatBytes(asset.glb_opt_size),
    asset.tri_after ? t("dl.triangles", { count: formatCount(asset.tri_after) }) : "",
    percent ? t("dl.reduced", { percent }) : "",
  ].filter(Boolean).join(" · ");
  $("#downloadOriginalInfo").textContent = [
    formatBytes(asset.glb_size),
    asset.tri_before ? t("dl.triangles", { count: formatCount(asset.tri_before) }) : "",
  ].filter(Boolean).join(" · ");
  $("#downloadOverlay").hidden = false;
}

function closeDownloadChoice() {
  $("#downloadOverlay").hidden = true;
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
  ["#categoryFilter", "#statusFilter", "#sortSelect", "#optimizedFilter"].forEach((selector) => {
    $(selector).addEventListener("change", reloadFromFirstPage);
  });
  $("#tagBarList").addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-tag]");
    if (!chip) return;
    const tag = chip.dataset.tag;
    const label = chip.dataset.label || tag;
    const input = $("#searchInput");
    const current = input.value.trim().toLowerCase();
    input.value = current === tag.toLowerCase() || current === label.toLowerCase() ? "" : label;
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
    $("#optimizedFilter").value = "";
    $("#sortSelect").value = "created_desc";
    state.method = "";
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
  $("#methodTabs").addEventListener("click", (event) => {
    const tab = event.target.closest("button[data-method]");
    if (!tab || tab.dataset.method === state.method) return;
    state.method = tab.dataset.method;
    renderMethodTabs();
    reloadFromFirstPage();
  });
  $("#assetTableBody").addEventListener("change", (event) => {
    const box = event.target.closest("input[data-select]");
    if (!box) return;
    const id = Number(box.dataset.select);
    if (box.checked) state.selected.add(id);
    else state.selected.delete(id);
    box.closest("tr").classList.toggle("selected", box.checked);
    renderBatchBar();
  });
  $("#selectAllBox").addEventListener("change", (event) => {
    state.items.forEach((item) => {
      if (event.target.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
    });
    renderTable();
    renderBatchBar();
  });
  $("#batchBar").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-batch-method]");
    if (button) applyBatchMethod(button.dataset.batchMethod);
  });
  $("#batchClearBtn").addEventListener("click", () => {
    state.selected.clear();
    renderTable();
    renderBatchBar();
  });
  $("#methodPicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-method]");
    if (!button) return;
    state.editMethod = button.dataset.method;
    $("#methodPicker").classList.remove("invalid");
    renderMethodPicker();
  });
  $("#assetCardGrid").addEventListener("click", handleAssetAction);
  $("#viewSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    state.viewMode = button.dataset.view === "card" ? "card" : "table";
    localStorage.setItem("asset_view", state.viewMode);
    state.selected.clear();
    renderAssets();
    renderBatchBar();
  });

  $("#editorModeSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-editor-mode]");
    if (!button || !state.editingId) return;
    openEditor(state.editingId, button.dataset.editorMode, { asset: state.editingAsset, onClose: state.editorReturn });
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
    if ($("#slideshow").open || $("#trashDialog").open) return;
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
  $("#versionSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-version]");
    if (!button || !state.detailId || button.dataset.version === state.detailVersion) return;
    state.detailVersion = button.dataset.version;
    openDetail(state.detailId);
  });
  $("#detailOptimizeBtn").addEventListener("click", () => {
    const id = state.detailId;
    closeDetail();
    openOptimizer(id);
  });
  $("#detailDeleteOptBtn").addEventListener("click", deleteOptimized);
  $("#detailDownloadBtn").addEventListener("click", (event) => {
    event.preventDefault();
    if (state.detailId) downloadAsset(state.detailId);
  });
  $("#downloadCloseBtn").addEventListener("click", closeDownloadChoice);
  $("#downloadOverlay").addEventListener("mousedown", (event) => {
    if (event.target.id === "downloadOverlay") closeDownloadChoice();
  });
  $$("#downloadOverlay .download-option").forEach((link) => link.addEventListener("click", () => setTimeout(closeDownloadChoice, 0)));
  bindOptimizerEvents();
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
    if (event.key !== "Escape" || $("#slideshow").open || $("#trashDialog").open) return;
    if (!$("#downloadOverlay").hidden) closeDownloadChoice();
    else if (!$("#optOverlay").hidden) closeOptimizer();
    else if (!$("#accountOverlay").hidden) closeAccount();
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
  $("#trashBtn").hidden = !can("delete");
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
  bindSlideshow({ query: currentQuery, apiFetch, canTrash: () => can("delete"), onTrashed: loadAssets, t });
  bindTrash({
    apiFetch,
    loadAssets,
    editAsset: (asset, onClose) => openEditor(asset.id, "edit", { asset, onClose }),
    optimizeAsset: (asset, onClose) => openOptimizer(asset.id, { asset, onClose }),
    canOptimize,
    t,
  });
  bindAccountEvents();
  loadAssets();
}

boot();
