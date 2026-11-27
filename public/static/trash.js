function bindTrash({ apiFetch, loadAssets, t }) {
  const dialog = document.querySelector("#trashDialog");
  const list = dialog.querySelector("#trashList");
  const status = dialog.querySelector("#trashStatus");
  const pages = dialog.querySelector("#trashPages");
  const previous = dialog.querySelector("#trashPrevious");
  const next = dialog.querySelector("#trashNext");
  const pageNumber = dialog.querySelector("#trashPageNumber");
  let page = 1;
  let request;
  let busy = false;

  function renderItem(asset) {
    const row = document.createElement("li");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const info = document.createElement("small");
    title.textContent = asset.name;
    info.textContent = [asset.code, t("trash.deletedAt", { time: asset.deleted_at })].filter(Boolean).join(" · ");
    details.append(title, info);
    const actions = document.createElement("div");
    actions.className = "trash-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn btn-secondary";
    restore.textContent = t("trash.restore");
    restore.hidden = Boolean(asset.purge_started);
    restore.addEventListener("click", () => change(asset, "restore", "POST"));
    const purge = document.createElement("button");
    purge.type = "button";
    purge.className = "btn btn-secondary trash-purge";
    purge.textContent = t(asset.purge_started ? "trash.retryPurge" : "trash.purge");
    purge.addEventListener("click", () => {
      if (window.confirm(t("trash.confirmPurge", { name: asset.name }))) change(asset, "purge", "DELETE");
    });
    actions.append(restore, purge);
    row.append(details, actions);
    return row;
  }

  async function load(target = page, errorMessage = "") {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    status.hidden = false;
    status.textContent = t("trash.loading");
    list.hidden = pages.hidden = true;
    try {
      const data = await apiFetch(`/api/assets/trash?page=${target}`, { signal: controller.signal });
      if (controller.signal.aborted || !dialog.open) return;
      page = data.page;
      list.replaceChildren(...data.items.map(renderItem));
      list.hidden = !data.items.length;
      status.hidden = !errorMessage && !list.hidden;
      status.textContent = errorMessage || t("trash.empty");
      pages.hidden = data.pages < 2;
      previous.disabled = page <= 1;
      next.disabled = page >= data.pages;
      pageNumber.textContent = `${page} / ${data.pages}`;
    } catch (error) {
      if (!controller.signal.aborted && dialog.open) status.textContent = error.message;
    }
  }

  async function change(asset, action, method) {
    if (busy) return;
    busy = true;
    list.inert = pages.inert = true;
    status.hidden = false;
    status.textContent = t("trash.working");
    let errorMessage = "";
    try {
      await apiFetch(`/api/assets/${asset.id}/${action}`, { method });
      if (action === "restore") loadAssets();
    } catch (error) {
      errorMessage = error.message;
    } finally {
      if (dialog.open) await load(page, errorMessage);
      busy = list.inert = pages.inert = false;
    }
  }

  document.querySelector("#trashBtn").addEventListener("click", () => {
    dialog.showModal();
    load(1);
  });
  dialog.querySelector("#trashClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (!dialog.open) request?.abort();
  });
  previous.addEventListener("click", () => load(page - 1));
  next.addEventListener("click", () => load(page + 1));
}
