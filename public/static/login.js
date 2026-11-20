const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const t = (key, vars) => I18N.t(key, vars);

I18N.init();
let registrationMode = "open";

function applyI18n() {
  document.documentElement.lang = I18N.current === "en" ? "en" : "zh-CN";
  document.title = `${t("auth.loginTab")} · ModelVault`;
  $$("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $$("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  $$("#langSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === I18N.current);
  });
  renderRegisterNote();
}

function renderRegisterNote() {
  const key = { open: "auth.registerOpen", approval: "auth.registerApproval", closed: "auth.registerClosed" }[registrationMode];
  $("#registerNote").textContent = t(key);
  $("#registerBtn").disabled = registrationMode === "closed";
}

function nextUrl() {
  const next = new URLSearchParams(location.search).get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function post(url, data) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "ModelVault" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(I18N.serverError(payload.error || t("error.request", { status: response.status })));
  return payload;
}

function showTab(tab) {
  $$("#authTabs button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $("#loginForm").hidden = tab !== "login";
  $("#registerForm").hidden = tab !== "register";
}

function setMessage(id, text, ok = false) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("ok", ok);
}

$("#authTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tab]");
  if (button) showTab(button.dataset.tab);
});

$("#langSwitch").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-lang]");
  if (!button) return;
  I18N.set(button.dataset.lang);
  applyI18n();
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const button = $("#loginBtn");
  button.disabled = true;
  button.textContent = t("auth.loggingIn");
  setMessage("#loginMsg", "");
  try {
    await post("/api/auth/login", {
      username: String(form.get("username") || "").trim(),
      password: form.get("password"),
    });
    location.href = nextUrl();
  } catch (error) {
    setMessage("#loginMsg", error.message);
  } finally {
    button.disabled = false;
    button.textContent = t("auth.login");
  }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  if (form.get("password") !== form.get("confirm")) {
    setMessage("#registerMsg", t("auth.passwordMismatch"));
    return;
  }
  const button = $("#registerBtn");
  button.disabled = true;
  button.textContent = t("auth.registering");
  setMessage("#registerMsg", "");
  try {
    const data = await post("/api/auth/register", {
      username: String(form.get("username") || "").trim().toLowerCase(),
      display_name: String(form.get("display_name") || "").trim(),
      password: form.get("password"),
    });
    if (data.pending) {
      setMessage("#registerMsg", t("auth.pending"), true);
      event.target.reset();
    } else {
      location.href = nextUrl();
    }
  } catch (error) {
    setMessage("#registerMsg", error.message);
  } finally {
    button.disabled = registrationMode === "closed";
    button.textContent = t("auth.register");
  }
});

async function init() {
  applyI18n();
  try {
    const me = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (me.ok) {
      location.href = nextUrl();
      return;
    }
    const config = await fetch("/api/auth/config").then((r) => r.json());
    registrationMode = config.registration || "open";
  } catch {
    registrationMode = "open";
  }
  renderRegisterNote();
  if (registrationMode === "closed") $('#authTabs button[data-tab="register"]').hidden = true;
  if (location.hash === "#register" && registrationMode !== "closed") showTab("register");
}

init();
