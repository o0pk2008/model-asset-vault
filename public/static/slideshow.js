function bindSlideshow({ query, apiFetch, t }) {
  const dialog = document.querySelector("#slideshow");
  const frame = dialog.querySelector("#slideshowFrame");
  const fullscreen = dialog.querySelector("#slideshowFullscreen");
  const background = dialog.querySelector("#slideshowBackground");
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
  const intervalValue = dialog.querySelector("#slideshowIntervalValue");
  const version = dialog.querySelector("#slideshowModelVersion");
  const normal = dialog.querySelector("#slideshowNormal");
  const white = dialog.querySelector("#slideshowWhite");
  const reveal = dialog.querySelector("#slideshowReveal");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const slides = new Map();
  const unavailable = new Set();
  let items = [];
  let index = 0;
  let timer;
  let queueRequest;
  let pending;
  let swipe;
  let whiteMode = false;

  function position(from, direction) {
    for (let count = 1; count <= items.length; count++) {
      const target = (from + direction * count + items.length) % items.length;
      if (!unavailable.has(target)) return target;
    }
    return null;
  }

  function setStatus(key) {
    status.textContent = key ? t(key) : "";
    status.hidden = !key;
  }

  function schedule() {
    clearTimeout(timer);
    const slide = slides.get(index);
    if (!dialog.open || !play.checked || pending || items.length - unavailable.size < 2 || !slide || slide.status === "loading") return;
    timer = setTimeout(() => move(1), Number(interval.value) * 1000);
  }

  function refreshInterval() {
    const value = Number(interval.value).toLocaleString(document.documentElement.lang);
    intervalValue.value = t("slideshow.seconds", { value });
    interval.setAttribute("aria-valuetext", intervalValue.value);
  }

  function updateCaption() {
    const total = items.length - unavailable.size;
    previous.hidden = next.hidden = play.disabled = interval.disabled = total < 2;
    const asset = items[index];
    const slide = slides.get(index);
    const skipped = [...unavailable].filter((slideIndex) => slideIndex < index).length;
    name.textContent = asset.name;
    meta.textContent = [
      asset.code,
      t("slideshow.position", { current: index + 1 - skipped, total }),
      slide?.status === "ready" ? t(slide.versionLabel) : "",
    ].filter(Boolean).join(" · ");
  }

  function syncMode() {
    for (const [button, active] of [[normal, !whiteMode], [white, whiteMode]]) {
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    reveal.disabled = whiteMode;
    const slide = slides.get(index);
    if (slide?.status === "ready") setWhite(slide, Number(whiteMode));
  }

  function setWhite(slide, amount) {
    cancelAnimationFrame(slide.revealFrame);
    slide.material?.(amount);
  }

  function animateReveal(slide) {
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.max(0, Math.min(1, (now - start) / 480));
      slide.material(1 - progress);
      if (progress < 1) slide.revealFrame = requestAnimationFrame(tick);
    };
    slide.revealFrame = requestAnimationFrame(tick);
  }

  function removeSlide(slideIndex) {
    const slide = slides.get(slideIndex);
    slides.delete(slideIndex);
    slide.request.abort();
    cancelAnimationFrame(slide.revealFrame);
    slide.element.remove();
  }

  function keepNearby() {
    const nearby = new Set([index, position(index, 1), position(index, -1), pending?.index, swipe?.from]);
    for (const slideIndex of slides.keys()) {
      if (!nearby.has(slideIndex)) removeSlide(slideIndex);
    }
    if (slides.get(index)?.status !== "loading") {
      for (const slideIndex of nearby) {
        if (slideIndex != null && !unavailable.has(slideIndex)) ensureSlide(slideIndex);
      }
    }
  }

  function showCurrentStatus() {
    const slide = slides.get(index);
    const key = { loading: "detail.loading", error: "toast.glbFailed", ready: "" }[slide.status];
    updateCaption();
    if (!pending) setStatus(key);
    schedule();
    keepNearby();
  }

  function ensureSlide(slideIndex) {
    if (slides.has(slideIndex)) return;
    const asset = items[slideIndex];
    const element = document.createElement("div");
    element.className = "slideshow-slide";
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
    const viewer = document.createElement("model-viewer");
    viewer.setAttribute("alt", asset.name);
    viewer.setAttribute("loading", "eager");
    viewer.setAttribute("camera-controls", "");
    viewer.setAttribute("interaction-prompt", "none");
    viewer.setAttribute("auto-rotate-delay", "0");
    viewer.setAttribute("rotation-per-second", "24deg");
    viewer.setAttribute("environment-image", "/static/env/studio.hdr");
    viewer.setAttribute("shadow-intensity", "1");
    element.append(viewer);

    const request = new AbortController();
    const preferOptimized = version.value === "opt";
    const slide = { element, viewer, request, status: "loading" };
    slides.set(slideIndex, slide);

    const settle = (result) => {
      if (slides.get(slideIndex) !== slide || !dialog.open) return;
      slide.status = result;
      if (result === "ready") slide.material = slideshowMaterialEffect(viewer);
      if (slideIndex === index) {
        setWhite(slide, Number(whiteMode));
        showCurrentStatus();
      }
      presentPending();
    };
    viewer.addEventListener("load", () => settle("ready"), { once: true });
    viewer.addEventListener("error", () => settle("error"), { once: true });
    models.append(element);

    // Request fresh signed URLs only for the current model and its neighbors.
    apiFetch(`/api/assets/${asset.id}`, { signal: request.signal })
      .then((data) => {
        if (request.signal.aborted) return;
        const optimizedUrl = preferOptimized ? data.glb_opt_url : "";
        const url = optimizedUrl || data.glb_url;
        slide.versionLabel = optimizedUrl ? "opt.versionOpt" : "slideshow.originalVersion";
        if (url) viewer.setAttribute("src", url);
        else settle("error");
      })
      .catch((error) => {
        if (request.signal.aborted || !dialog.open) return;
        if (error.status === 404) markUnavailable(slideIndex);
        else settle("error");
      });
  }

  function activate(slide, active) {
    slide.element.classList.toggle("active", active);
    slide.element.inert = !active;
    slide.element.setAttribute("aria-hidden", String(!active));
    slide.viewer.toggleAttribute("auto-rotate", active && rotate.checked);
  }

  function loadCurrent() {
    ensureSlide(index);
    activate(slides.get(index), true);
    showCurrentStatus();
  }

  function presentPending() {
    if (!pending?.verified || swipe || !dialog.open) return;
    const slide = slides.get(pending.index);
    if (!slide || slide.status === "loading") return;

    const from = index;
    const old = slides.get(from);
    const direction = pending.direction;
    index = pending.index;
    pending = null;
    const animate = Boolean(old && !reducedMotion.matches);
    const revealMaterial = !whiteMode && reveal.checked && !reducedMotion.matches && slide.status === "ready";
    setWhite(slide, Number(whiteMode || revealMaterial));
    if (old) {
      old.element.classList.toggle("outgoing", animate);
      activate(old, false);
    }
    activate(slide, true);

    if (animate) {
      const offset = direction * 100;
      const options = { duration: 340, easing: "cubic-bezier(.25, .75, .25, 1)", fill: "both" };
      const outgoing = old.element.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-offset}%)` }], options);
      const incoming = slide.element.animate([{ transform: `translateX(${offset}%)` }, { transform: "translateX(0)" }], options);
      const transition = { from, outgoing, incoming };
      swipe = transition;
      incoming.onfinish = () => {
        if (swipe !== transition) return;
        swipe = null;
        old.element.classList.remove("outgoing");
        outgoing.cancel();
        incoming.cancel();
        if (revealMaterial && !whiteMode && reveal.checked) animateReveal(slide);
        keepNearby();
        presentPending();
      };
    } else if (revealMaterial) {
      animateReveal(slide);
    }
    showCurrentStatus();
  }

  function cancelPending() {
    pending?.request.abort();
    pending = null;
  }

  function markUnavailable(slideIndex) {
    const direction = pending?.index === slideIndex ? pending.direction : 0;
    unavailable.add(slideIndex);
    if (direction) cancelPending();
    if (swipe?.from !== slideIndex) removeSlide(slideIndex);
    if (unavailable.size === items.length) {
      controls.hidden = previous.hidden = next.hidden = true;
      name.textContent = "";
      meta.textContent = "";
      setStatus("slideshow.empty");
      return;
    }
    if (direction || slideIndex === index) move(direction || 1, slideIndex);
    else {
      updateCaption();
      keepNearby();
    }
  }

  function move(direction, from = pending?.index ?? index) {
    if (!dialog.open || !items.length) return;
    clearTimeout(timer);
    cancelPending();
    const target = position(from, direction);
    if (target === null) return;
    if (target === index) {
      showCurrentStatus();
      return;
    }
    const request = new AbortController();
    const selection = { index: target, direction, request, verified: false };
    pending = selection;
    ensureSlide(target);
    keepNearby();
    if (slides.get(target).status === "loading") setStatus("detail.loading");

    // A GLB can already be cached when another session moves its asset to trash.
    apiFetch(`/api/assets/${items[target].id}`, { method: "HEAD", signal: request.signal })
      .then(() => {
        if (pending !== selection || !dialog.open) return;
        selection.verified = true;
        presentPending();
      })
      .catch((error) => {
        if (pending !== selection || !dialog.open) return;
        if (error.status === 404) {
          markUnavailable(target);
        } else {
          cancelPending();
          setStatus("slideshow.queueError");
          schedule();
        }
      });
  }

  function isFullscreen() {
    return document.fullscreenElement === frame || dialog.classList.contains("expanded");
  }

  function syncFullscreen() {
    const label = isFullscreen() ? "slideshow.exitFullscreen" : "slideshow.fullscreen";
    fullscreen.dataset.i18n = label;
    fullscreen.textContent = t(label);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement === frame) {
      await document.exitFullscreen().catch(() => {});
    } else if (dialog.classList.contains("expanded")) {
      dialog.classList.remove("expanded");
    } else if (document.fullscreenEnabled && frame.requestFullscreen) {
      try {
        await frame.requestFullscreen();
        if (!dialog.open && document.fullscreenElement === frame) await document.exitFullscreen();
      } catch {
        if (dialog.open) dialog.classList.add("expanded");
      }
    } else {
      dialog.classList.add("expanded");
    }
    syncFullscreen();
  }

  function setDark(dark) {
    dialog.classList.toggle("black-background", dark);
    background.setAttribute("aria-pressed", String(dark));
  }

  function clearSlides() {
    clearTimeout(timer);
    cancelPending();
    swipe?.incoming.cancel();
    swipe?.outgoing.cancel();
    swipe = null;
    for (const slideIndex of slides.keys()) removeSlide(slideIndex);
  }

  function reset() {
    queueRequest?.abort();
    clearSlides();
    unavailable.clear();
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
    reveal.checked = false;
    whiteMode = false;
    version.value = "opt";
    interval.value = "5";
    refreshInterval();
    syncMode();
    setDark(false);
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
      loadCurrent();
    } catch {
      if (!request.signal.aborted && dialog.open) setStatus("slideshow.queueError");
    }
  }

  document.querySelector("#slideshowBtn").addEventListener("click", open);
  dialog.querySelector("#slideshowClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    reset();
    if (isFullscreen()) toggleFullscreen();
  });
  dialog.addEventListener("cancel", (event) => {
    if (!isFullscreen()) return;
    event.preventDefault();
    toggleFullscreen();
  });
  document.addEventListener("fullscreenchange", syncFullscreen);
  fullscreen.addEventListener("click", toggleFullscreen);
  background.addEventListener("click", () => setDark(!dialog.classList.contains("black-background")));
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  normal.addEventListener("click", () => {
    whiteMode = false;
    syncMode();
  });
  white.addEventListener("click", () => {
    whiteMode = true;
    syncMode();
  });
  reveal.addEventListener("change", () => {
    if (!reveal.checked) syncMode();
  });
  rotate.addEventListener("change", () => {
    slides.get(index)?.viewer.toggleAttribute("auto-rotate", rotate.checked);
  });
  play.addEventListener("change", schedule);
  version.addEventListener("change", () => {
    const current = unavailable.has(index) ? position(index, 1) : index;
    if (current === null || !items.length) return;
    clearSlides();
    index = current;
    loadCurrent();
  });
  interval.addEventListener("input", () => {
    refreshInterval();
    schedule();
  });
  dialog.addEventListener("keydown", (event) => {
    if (items.length - unavailable.size < 2 || event.target.closest("input, select")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    move(event.key === "ArrowLeft" ? -1 : 1);
  }, { capture: true });
}
