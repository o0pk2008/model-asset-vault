const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

I18N.init();

const t = (key, vars) => I18N.t(key, vars);

const state = {
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

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
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
  return params;
}

async function loadAssets() {
  try {
    const data = await apiFetch(`/api/assets?${currentQuery().toString()}`);
    state.items = data.items || [];
    state.stats = data.stats || {};
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
}

function renderTable() {
  const tbody = $("#assetTableBody");
  const items = state.items;
  $("#resultCount").textContent = t("common.resultCount", { count: items.length });
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
              <button class="action-btn edit" type="button" data-action="edit" data-id="${item.id}" title="${editLabel}" aria-label="${editLabel}">${ICONS.edit}</button>
              <button class="action-btn download" type="button" data-action="download" data-id="${item.id}" title="${downloadLabel}" aria-label="${downloadLabel}" ${item.glb_url ? "" : "disabled"}>${ICONS.download}</button>
              <button class="action-btn danger" type="button" data-action="delete" data-id="${item.id}" title="${deleteLabel}" aria-label="${deleteLabel}">${ICONS.delete}</button>
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
            <button class="action-btn edit" type="button" data-action="edit" data-id="${item.id}" title="${editLabel}" aria-label="${editLabel}">${ICONS.edit}</button>
            <button class="action-btn download" type="button" data-action="download" data-id="${item.id}" title="${downloadLabel}" aria-label="${downloadLabel}" ${item.glb_url ? "" : "disabled"}>${ICONS.download}</button>
            <button class="action-btn danger" type="button" data-action="delete" data-id="${item.id}" title="${deleteLabel}" aria-label="${deleteLabel}">${ICONS.delete}</button>
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
    const needsCompletion = asset && !asset.glb_path && asset.status === "待制作";
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
  $("#editorModeSwitch").hidden = !id;
  $$("#editorModeSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.editorMode === mode);
  });
  $("#basicFields").hidden = isCompletion;
  $("#completionContext").hidden = !isCompletion;
  $("#completionFields").hidden = !isCompletion;
  $$(".upload-zone").forEach((zone) => {
    zone.hidden = isCompletion
      ? zone.dataset.field === "photo"
      : isCreate
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

function setFile(field, file, quiet = false) {
  if (!file || !validateFile(field, file)) return false;
  revokeObjectUrls();
  state.files[field] = file;
  state.removed[field] = false;
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
      changed = setFile("glb", file, true) || changed;
      continue;
    }
    if (!file.type.startsWith("image/")) continue;

    const imageFields = state.editorMode === "completion"
      ? ["screenshot", "photo"]
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

async function saveAsset() {
  if (!$("#nameInput").value.trim()) {
    toast(t("toast.nameRequired"), "error");
    $("#nameInput").focus();
    return;
  }

  const mode = state.editorMode;
  const form = $("#assetForm");
  const formData = new FormData(form);
  ["photo", "screenshot", "glb"].forEach((field) => {
    if (state.files[field]) formData.append(field, state.files[field]);
    if (state.removed[field]) formData.append(`remove_${field}`, "true");
  });
  formData.delete("assetId");
  formData.delete("status");
  formData.delete("editorStatus");
  formData.delete("completionStatus");
  formData.delete("completionMaker");
  if (mode === "completion") {
    formData.set("maker", $("#makerInput").value.trim());
  }

  const button = $("#saveAssetBtn");
  button.disabled = true;
  button.textContent = t("editor.saving");
  try {
    const url = state.editingId ? `/api/assets/${state.editingId}` : "/api/assets";
    await apiFetch(url, { method: state.editingId ? "PUT" : "POST", body: formData });
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
  $("#detailDownloadBtn").href = asset.glb_url ? `/api/assets/${asset.id}/download` : "#";
  $("#detailDownloadBtn").style.display = asset.glb_url ? "inline-flex" : "none";
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
    debounceTimer = setTimeout(loadAssets, 250);
  });
  ["#categoryFilter", "#statusFilter", "#sortSelect"].forEach((selector) => {
    $(selector).addEventListener("change", loadAssets);
  });
  $("#resetFilterBtn").addEventListener("click", () => {
    $("#searchInput").value = "";
    $("#categoryFilter").value = "";
    $("#statusFilter").value = "";
    $("#sortSelect").value = "updated_desc";
    loadAssets();
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
    event.preventDefault();
    if ($("#editorOverlay").hidden) openEditor();
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
    if (!$("#imageOverlay").hidden) closeImagePreview();
    else if (!$("#helpOverlay").hidden) $("#helpOverlay").hidden = true;
    else if (!$("#detailOverlay").hidden) closeDetail();
    else if (!$("#editorOverlay").hidden) closeEditor();
  });
}

applyStaticI18n();
bindEvents();
loadAssets();
