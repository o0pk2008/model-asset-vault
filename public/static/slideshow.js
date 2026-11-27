function bindSlideshow({ query, apiFetch, t }) {
  const dialog = document.querySelector("#slideshow");
  const models = dialog.querySelector("#slideshowModels");
  const status = dialog.querySelector("#slideshowStatus");
  const name = dialog.querySelector("#slideshowName");
  const meta = dialog.querySelector("#slideshowMeta");
  const controls = dialog.querySelector("#slideshowControls");
  const previous = dialog.querySelector("#slideshowPrev");
  const next = dialog.querySelector("#slideshowNext");
  const rotate = dialog.querySelector("#slideshowRotate");
  const play = dialog.querySelector("#slideshowPlay");
  const interval = dialog.querySelector("#slideshowInterval");

  const slides = new Map();
  let items = [];
  let index = 0;
  let timer;
  let queueRequest;

  function position(offset) {
    return (index + offset + items.length) % items.length;
  }

  function setStatus(key) {
    status.textContent = key ? t(key) : "";
    status.hidden = !key;
  }

  function schedule() {
    clearTimeout(timer);
    const slide = slides.get(index);
    if (!dialog.open || !play.checked || items.length < 2 || !slide || slide.status === "loading") return;
    timer = setTimeout(() => move(1), Number(interval.value) * 1000);
  }

  function removeSlide(slideIndex) {
    const slide = slides.get(slideIndex);
    slides.delete(slideIndex);
    slide.request.abort();
    slide.viewer.remove();
  }

  function showCurrentStatus() {
    const slide = slides.get(index);
    const key = { loading: "detail.loading", error: "toast.glbFailed", ready: "" }[slide.status];
    setStatus(key);
    schedule();
    if (slide.status !== "loading") {
      ensureSlide(position(1));
      ensureSlide(position(-1));
    }
  }

  function ensureSlide(slideIndex) {
    if (slides.has(slideIndex)) return;
    const asset = items[slideIndex];
    const viewer = document.createElement("model-viewer");
    viewer.setAttribute("alt", asset.name);
    viewer.setAttribute("loading", "eager");
    viewer.setAttribute("camera-controls", "");
    viewer.setAttribute("interaction-prompt", "none");
    viewer.setAttribute("auto-rotate-delay", "0");
    viewer.setAttribute("rotation-per-second", "24deg");
    viewer.setAttribute("environment-image", "/static/env/studio.hdr");
    viewer.setAttribute("shadow-intensity", "1");
    viewer.setAttribute("inert", "");
    viewer.setAttribute("aria-hidden", "true");

    const request = new AbortController();
    const slide = { viewer, request, status: "loading" };
    slides.set(slideIndex, slide);

    const settle = (result) => {
      if (slides.get(slideIndex) !== slide || !dialog.open) return;
      slide.status = result;
      if (slideIndex === index) showCurrentStatus();
    };
    viewer.addEventListener("load", () => settle("ready"), { once: true });
    viewer.addEventListener("error", () => settle("error"), { once: true });
    models.append(viewer);

    // Request fresh signed URLs only for the current model and its neighbors.
    apiFetch(`/api/assets/${asset.id}`, { signal: request.signal })
      .then((data) => {
        if (request.signal.aborted) return;
        const url = data.glb_opt_url || data.glb_url;
        if (url) viewer.setAttribute("src", url);
        else settle("error");
      })
      .catch(() => settle("error"));
  }

  function move(offset) {
    if (!items.length) return;
    index = position(offset);
    const nearby = new Set([index, position(-1), position(1)]);
    for (const slideIndex of slides.keys()) {
      if (!nearby.has(slideIndex)) removeSlide(slideIndex);
    }
    ensureSlide(index);
    for (const [slideIndex, { viewer }] of slides) {
      const active = slideIndex === index;
      viewer.classList.toggle("active", active);
      viewer.toggleAttribute("inert", !active);
      viewer.setAttribute("aria-hidden", String(!active));
      viewer.toggleAttribute("auto-rotate", active && rotate.checked);
    }
    const asset = items[index];
    name.textContent = asset.name;
    meta.textContent = [asset.code, t("slideshow.position", { current: index + 1, total: items.length })]
      .filter(Boolean).join(" · ");
    showCurrentStatus();
  }

  function reset() {
    clearTimeout(timer);
    queueRequest?.abort();
    for (const slideIndex of slides.keys()) removeSlide(slideIndex);
    items = [];
    index = 0;
  }

  async function open() {
    reset();
    name.textContent = "";
    meta.textContent = "";
    controls.hidden = previous.hidden = next.hidden = true;
    rotate.checked = true;
    play.checked = false;
    interval.value = "5";
    setStatus("slideshow.queueLoading");
    dialog.showModal();

    const params = query();
    params.delete("page");
    params.delete("page_size");
    const request = new AbortController();
    queueRequest = request;
    try {
      const data = await apiFetch(`/api/assets/slideshow?${params}`, { signal: request.signal });
      if (request.signal.aborted || !dialog.open) return;
      items = data.items;
      if (!items.length) {
        setStatus("slideshow.empty");
        return;
      }
      controls.hidden = false;
      previous.hidden = next.hidden = play.disabled = interval.disabled = items.length < 2;
      move(0);
    } catch {
      if (!request.signal.aborted && dialog.open) setStatus("slideshow.queueError");
    }
  }

  document.querySelector("#slideshowBtn").addEventListener("click", open);
  dialog.querySelector("#slideshowClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (!dialog.open) reset();
  });
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  rotate.addEventListener("change", () => {
    slides.get(index)?.viewer.toggleAttribute("auto-rotate", rotate.checked);
  });
  play.addEventListener("change", schedule);
  interval.addEventListener("change", schedule);
  dialog.addEventListener("keydown", (event) => {
    if (items.length < 2 || event.target.closest("input, select")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    move(event.key === "ArrowLeft" ? -1 : 1);
  }, { capture: true });
}
