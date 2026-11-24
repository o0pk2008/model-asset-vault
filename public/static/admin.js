const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const t = (key, vars) => I18N.t(key, vars);

I18N.extend({
  zh: {
    "adm.console": "管理后台",
    "adm.backToLibrary": "返回资产库",
    "adm.save": "保存",
    "adm.saved": "已保存",
    "adm.viewAll": "查看全部",
    "adm.nav.overview": "概览",
    "adm.nav.users": "用户管理",
    "adm.nav.storage": "存储设置",
    "adm.nav.system": "系统设置",
    "adm.nav.logs": "操作日志",
    "adm.overview.desc": "平台运行状态一览。",
    "adm.overview.platform": "平台信息",
    "adm.overview.recent": "最近操作",
    "adm.stat.users": "用户总数",
    "adm.stat.usersNote": "{active} 个启用 · {disabled} 个停用",
    "adm.stat.pending": "待审核",
    "adm.stat.pendingNote": "等待管理员通过",
    "adm.stat.assets": "资产 / 任务",
    "adm.stat.assetsNote": "{completed} 个已完成",
    "adm.stat.glb": "GLB 总大小",
    "adm.stat.glbNote": "已登记的模型文件",
    "adm.info.database": "数据库",
    "adm.info.storage": "文件存储",
    "adm.info.bucket": "存储桶",
    "adm.info.registration": "注册方式",
    "adm.info.admins": "管理员数量",
    "adm.storage.none": "未配置",
    "adm.storage.local": "本地磁盘（开发模式）",
    "adm.storage.s3": "AWS S3 配置",
    "adm.storage.ready": "已配置",
    "adm.storage.notReady": "未配置",
    "adm.storage.fromEnv": "来自环境变量",
    "adm.storage.desc": "参考照片、制作截图和 GLB 文件保存在 AWS S3。浏览器直接上传到存储桶，不经过 Vercel 服务器。",
    "adm.storage.bucket": "存储桶名称 (Bucket)",
    "adm.storage.region": "区域 (Region)",
    "adm.storage.secretHint": "留空表示不修改。密钥加密后保存在数据库中，不会回显。",
    "adm.storage.secretSet": "已保存：{hint}（留空不修改）",
    "adm.storage.prefix": "路径前缀",
    "adm.storage.expires": "访问链接有效期（小时）",
    "adm.storage.endpoint": "自定义 Endpoint（可选）",
    "adm.storage.endpointHint": "仅 S3 兼容服务（Cloudflare R2、MinIO 等）需要填写，AWS S3 请留空。",
    "adm.storage.test": "测试连接",
    "adm.storage.testing": "测试中…",
    "adm.storage.cors": "跨域 (CORS) 配置",
    "adm.storage.corsDesc": "浏览器直传和在线预览需要存储桶允许本站域名访问。填写站点域名（每行一个）后一键写入存储桶。",
    "adm.storage.applyCors": "写入 CORS 规则",
    "adm.storage.corsDone": "CORS 规则已写入存储桶",
    "adm.storage.corsMissing": "存储桶尚未配置 CORS，请在右侧写入 CORS 规则",
    "adm.storage.usage": "存储用量",
    "adm.storage.scan": "扫描",
    "adm.storage.scanning": "扫描中…",
    "adm.storage.scanHint": "点击“扫描”统计存储桶中的文件。",
    "adm.storage.objects": "文件数量",
    "adm.storage.totalSize": "总大小",
    "adm.storage.kind.photo": "参考照片",
    "adm.storage.kind.screenshot": "制作截图",
    "adm.storage.kind.glb": "GLB 模型",
    "adm.storage.orphans": "孤立文件",
    "adm.storage.orphansNote": "{count} 个 · {size}（上传后未保存或已被替换）",
    "adm.storage.cleanup": "清理孤立文件",
    "adm.storage.cleanupConfirm": "将删除没有任何资产引用、且上传超过 24 小时的文件，此操作不可恢复。继续吗？",
    "adm.storage.cleanupDone": "已删除 {count} 个文件，释放 {size}",
    "adm.storage.iam": "建议的 IAM 最小权限策略",
    "adm.storage.iamDesc": "为本平台单独创建一个 IAM 用户，只授予下面这个存储桶的权限，然后把它的 Access Key 填到上方。",
    "adm.users.desc": "所有账号默认只能查看和下载模型；“创建任务 / 编辑成果 / 删除任务”需要分别授权。管理员拥有全部权限。",
    "adm.users.search": "搜索用户名或显示名称…",
    "adm.users.new": "新建用户",
    "adm.users.create": "创建",
    "adm.users.created": "用户已创建",
    "adm.users.colUser": "用户",
    "adm.users.colStatus": "角色 / 状态",
    "adm.users.colLogin": "最近登录",
    "adm.users.initialPassword": "初始密码",
    "adm.users.never": "从未登录",
    "adm.users.you": "（你）",
    "adm.users.approve": "通过",
    "adm.users.enable": "启用",
    "adm.users.disable": "停用",
    "adm.users.resetPwd": "重置密码",
    "adm.users.makeAdmin": "设为管理员",
    "adm.users.removeAdmin": "取消管理员",
    "adm.users.unlock": "解锁",
    "adm.users.delete": "删除",
    "adm.users.empty": "没有符合条件的用户",
    "adm.users.resetPrompt": "为「{name}」设置新密码（已生成随机密码，可修改后确认，请自行告知对方）：",
    "adm.users.resetDone": "密码已重置，对方需要使用新密码重新登录",
    "adm.users.deleteConfirm": "确定删除用户「{name}」吗？其创建的资产会保留。",
    "adm.users.adminConfirm": "确定将「{name}」设为管理员吗？管理员拥有全部权限并可进入后台。",
    "adm.users.updated": "已更新",
    "adm.status.all": "全部状态",
    "adm.status.pending": "待审核",
    "adm.status.active": "已启用",
    "adm.status.disabled": "已停用",
    "adm.status.locked": "已锁定",
    "adm.system.desc": "控制新用户如何加入平台。",
    "adm.system.registration": "注册方式",
    "adm.reg.open": "开放注册",
    "adm.reg.openDesc": "任何人都可以注册，注册后立即可以查看和下载模型。",
    "adm.reg.approval": "注册需审核",
    "adm.reg.approvalDesc": "注册后进入“待审核”，管理员在用户管理中通过后才能登录。",
    "adm.reg.closed": "关闭注册",
    "adm.reg.closedDesc": "只有管理员可以在后台创建账号。",
    "adm.logs.desc": "记录登录、任务增删改、下载以及后台配置变更。",
    "adm.logs.search": "搜索操作人、对象或详情…",
    "adm.logs.all": "全部类型",
    "adm.logs.user": "账号",
    "adm.logs.asset": "任务 / 资产",
    "adm.logs.admin": "后台管理",
    "adm.logs.time": "时间",
    "adm.logs.actor": "操作人",
    "adm.logs.action": "操作",
    "adm.logs.target": "对象",
    "adm.logs.detail": "详情",
    "adm.logs.page": "共 {total} 条 · 第 {page}/{pages} 页",
    "adm.logs.empty": "暂无日志",
    "act.user.register": "注册账号",
    "act.user.login": "登录",
    "act.user.login_failed": "登录失败",
    "act.user.password_change": "修改密码",
    "act.asset.create": "创建任务",
    "act.asset.update": "编辑任务",
    "act.asset.delete": "删除任务",
    "act.asset.download": "下载 GLB",
    "act.admin.user_create": "创建用户",
    "act.admin.user_update": "修改用户",
    "act.admin.user_delete": "删除用户",
    "act.admin.password_reset": "重置密码",
    "act.admin.settings": "修改系统设置",
    "act.admin.storage_update": "修改存储设置",
    "act.admin.storage_cors": "写入 CORS",
    "act.admin.storage_cleanup": "清理孤立文件",
    "act.admin.images_compress": "压缩已有图片",
    "adm.nav.terms": "术语翻译",
    "adm.terms.desc": "标签和分类只需用中文录入。在这里为每个词填写一次英文名称，切换到英文界面时全平台自动显示英文；未翻译的词仍显示中文。",
    "adm.terms.search": "搜索中文或英文…",
    "adm.terms.onlyMissing": "只看未翻译",
    "adm.terms.summary": "共 {total} 个词，已翻译 {done} 个，未翻译 {missing} 个",
    "adm.terms.suggest": "填充建议",
    "adm.terms.suggested": "已为 {count} 个词填入建议译名，请检查后保存",
    "adm.terms.noSuggest": "没有可自动填充的词，请手动填写",
    "adm.terms.term": "中文（标准值）",
    "adm.terms.usage": "使用次数",
    "adm.terms.en": "英文显示名称",
    "adm.terms.tag": "标签 {count}",
    "adm.terms.category": "分类 {count}",
    "adm.terms.placeholder": "未翻译，英文界面显示中文",
    "adm.terms.saved": "已保存 {count} 处修改",
    "adm.terms.nothing": "没有需要保存的修改",
    "adm.terms.empty": "还没有任何标签或分类",
    "adm.terms.unsaved": "有未保存的翻译，确定离开吗？",
    "act.admin.terms": "修改术语翻译",
    "adm.images.title": "压缩已有图片",
    "adm.images.desc": "把已上传的参考照片和制作截图统一缩小到不超过 1024×1024 并转为 WebP，加快列表和预览加载。原图会被替换，GLB 不受影响。",
    "adm.images.pending": "待压缩",
    "adm.images.progress": "进度",
    "adm.images.start": "开始压缩",
    "adm.images.running": "压缩中…",
    "adm.images.none": "没有需要压缩的图片",
    "adm.images.count": "{count} 张",
    "adm.images.stat": "已压缩 {count} 张，失败 {failed} 张，{before} → {after}",
    "adm.images.confirm": "将压缩 {count} 张图片并替换原图，此操作不可撤销。继续吗？",
    "adm.images.done": "图片压缩完成",
  },
  en: {
    "adm.console": "Admin console",
    "adm.backToLibrary": "Back to library",
    "adm.save": "Save",
    "adm.saved": "Saved",
    "adm.viewAll": "View all",
    "adm.nav.overview": "Overview",
    "adm.nav.users": "Users",
    "adm.nav.storage": "Storage",
    "adm.nav.system": "System",
    "adm.nav.logs": "Audit log",
    "adm.overview.desc": "Platform status at a glance.",
    "adm.overview.platform": "Platform",
    "adm.overview.recent": "Recent activity",
    "adm.stat.users": "Users",
    "adm.stat.usersNote": "{active} active · {disabled} disabled",
    "adm.stat.pending": "Pending approval",
    "adm.stat.pendingNote": "Waiting for an administrator",
    "adm.stat.assets": "Assets / tasks",
    "adm.stat.assetsNote": "{completed} completed",
    "adm.stat.glb": "GLB total size",
    "adm.stat.glbNote": "Registered model files",
    "adm.info.database": "Database",
    "adm.info.storage": "File storage",
    "adm.info.bucket": "Bucket",
    "adm.info.registration": "Registration",
    "adm.info.admins": "Administrators",
    "adm.storage.none": "Not configured",
    "adm.storage.local": "Local disk (development)",
    "adm.storage.s3": "AWS S3 settings",
    "adm.storage.ready": "Configured",
    "adm.storage.notReady": "Not configured",
    "adm.storage.fromEnv": "From environment variables",
    "adm.storage.desc": "Reference photos, screenshots and GLB files are stored in AWS S3. Browsers upload directly to the bucket, bypassing the Vercel server.",
    "adm.storage.bucket": "Bucket name",
    "adm.storage.region": "Region",
    "adm.storage.secretHint": "Leave empty to keep the current key. It is stored encrypted and never shown again.",
    "adm.storage.secretSet": "Saved: {hint} (leave empty to keep)",
    "adm.storage.prefix": "Key prefix",
    "adm.storage.expires": "Link lifetime (hours)",
    "adm.storage.endpoint": "Custom endpoint (optional)",
    "adm.storage.endpointHint": "Only for S3-compatible services (Cloudflare R2, MinIO…). Leave empty for AWS S3.",
    "adm.storage.test": "Test connection",
    "adm.storage.testing": "Testing…",
    "adm.storage.cors": "CORS",
    "adm.storage.corsDesc": "Direct uploads and in-browser previews require the bucket to allow this site's origin. Enter origins (one per line) and apply.",
    "adm.storage.applyCors": "Apply CORS rules",
    "adm.storage.corsDone": "CORS rules applied to the bucket",
    "adm.storage.corsMissing": "The bucket has no CORS rules yet. Apply them on the right.",
    "adm.storage.usage": "Usage",
    "adm.storage.scan": "Scan",
    "adm.storage.scanning": "Scanning…",
    "adm.storage.scanHint": "Click Scan to count the files in the bucket.",
    "adm.storage.objects": "Files",
    "adm.storage.totalSize": "Total size",
    "adm.storage.kind.photo": "Reference photos",
    "adm.storage.kind.screenshot": "Screenshots",
    "adm.storage.kind.glb": "GLB models",
    "adm.storage.orphans": "Orphaned files",
    "adm.storage.orphansNote": "{count} · {size} (uploaded but never saved, or replaced)",
    "adm.storage.cleanup": "Clean up orphans",
    "adm.storage.cleanupConfirm": "Delete files that no asset references and that are older than 24 hours? This cannot be undone.",
    "adm.storage.cleanupDone": "Deleted {count} file(s), freed {size}",
    "adm.storage.iam": "Recommended least-privilege IAM policy",
    "adm.storage.iamDesc": "Create a dedicated IAM user for this platform with only this bucket's permissions, then enter its access key above.",
    "adm.users.desc": "Every account can view and download models. Creating tasks, editing/submitting results and deleting tasks are granted separately. Administrators have every permission.",
    "adm.users.search": "Search username or display name…",
    "adm.users.new": "New user",
    "adm.users.create": "Create",
    "adm.users.created": "User created",
    "adm.users.colUser": "User",
    "adm.users.colStatus": "Role / status",
    "adm.users.colLogin": "Last sign-in",
    "adm.users.initialPassword": "Initial password",
    "adm.users.never": "Never",
    "adm.users.you": " (you)",
    "adm.users.approve": "Approve",
    "adm.users.enable": "Enable",
    "adm.users.disable": "Disable",
    "adm.users.resetPwd": "Reset password",
    "adm.users.makeAdmin": "Make admin",
    "adm.users.removeAdmin": "Revoke admin",
    "adm.users.unlock": "Unlock",
    "adm.users.delete": "Delete",
    "adm.users.empty": "No matching users",
    "adm.users.resetPrompt": "New password for \"{name}\" (a random one is pre-filled; share it with the user):",
    "adm.users.resetDone": "Password reset. The user must sign in again with the new password.",
    "adm.users.deleteConfirm": "Delete user \"{name}\"? Assets they created are kept.",
    "adm.users.adminConfirm": "Make \"{name}\" an administrator? Administrators have every permission and can open this console.",
    "adm.users.updated": "Updated",
    "adm.status.all": "All statuses",
    "adm.status.pending": "Pending",
    "adm.status.active": "Active",
    "adm.status.disabled": "Disabled",
    "adm.status.locked": "Locked",
    "adm.system.desc": "Control how new users join the platform.",
    "adm.system.registration": "Registration",
    "adm.reg.open": "Open",
    "adm.reg.openDesc": "Anyone can register and immediately view and download models.",
    "adm.reg.approval": "Requires approval",
    "adm.reg.approvalDesc": "New accounts are pending until an administrator approves them.",
    "adm.reg.closed": "Closed",
    "adm.reg.closedDesc": "Only administrators can create accounts.",
    "adm.logs.desc": "Sign-ins, task changes, downloads and admin configuration changes.",
    "adm.logs.search": "Search actor, target or detail…",
    "adm.logs.all": "All types",
    "adm.logs.user": "Accounts",
    "adm.logs.asset": "Tasks / assets",
    "adm.logs.admin": "Administration",
    "adm.logs.time": "Time",
    "adm.logs.actor": "Actor",
    "adm.logs.action": "Action",
    "adm.logs.target": "Target",
    "adm.logs.detail": "Detail",
    "adm.logs.page": "{total} entries · page {page}/{pages}",
    "adm.logs.empty": "No log entries",
    "act.user.register": "Registered",
    "act.user.login": "Signed in",
    "act.user.login_failed": "Sign-in failed",
    "act.user.password_change": "Changed password",
    "act.asset.create": "Created task",
    "act.asset.update": "Edited task",
    "act.asset.delete": "Deleted task",
    "act.asset.download": "Downloaded GLB",
    "act.admin.user_create": "Created user",
    "act.admin.user_update": "Updated user",
    "act.admin.user_delete": "Deleted user",
    "act.admin.password_reset": "Reset password",
    "act.admin.settings": "Changed system settings",
    "act.admin.storage_update": "Changed storage settings",
    "act.admin.storage_cors": "Applied CORS",
    "act.admin.storage_cleanup": "Cleaned up orphans",
    "act.admin.images_compress": "Compressed images",
    "adm.nav.terms": "Term translations",
    "adm.terms.desc": "Tags and categories are entered in Chinese only. Give each term an English name once here and the English UI shows it everywhere; untranslated terms stay in Chinese.",
    "adm.terms.search": "Search Chinese or English…",
    "adm.terms.onlyMissing": "Untranslated only",
    "adm.terms.summary": "{total} terms, {done} translated, {missing} missing",
    "adm.terms.suggest": "Fill suggestions",
    "adm.terms.suggested": "Suggested names filled in for {count} term(s). Review, then save.",
    "adm.terms.noSuggest": "No suggestions available; please fill in manually",
    "adm.terms.term": "Chinese (stored value)",
    "adm.terms.usage": "Usage",
    "adm.terms.en": "English display name",
    "adm.terms.tag": "Tag {count}",
    "adm.terms.category": "Category {count}",
    "adm.terms.placeholder": "Not translated; shown in Chinese",
    "adm.terms.saved": "Saved {count} change(s)",
    "adm.terms.nothing": "Nothing to save",
    "adm.terms.empty": "No tags or categories yet",
    "adm.terms.unsaved": "You have unsaved translations. Leave anyway?",
    "act.admin.terms": "Updated term translations",
    "adm.images.title": "Compress existing images",
    "adm.images.desc": "Shrink uploaded reference photos and screenshots to at most 1024×1024 and convert them to WebP so lists and previews load faster. Originals are replaced; GLB files are untouched.",
    "adm.images.pending": "Pending",
    "adm.images.progress": "Progress",
    "adm.images.start": "Start",
    "adm.images.running": "Compressing…",
    "adm.images.none": "No images need compressing",
    "adm.images.count": "{count} image(s)",
    "adm.images.stat": "{count} compressed, {failed} failed, {before} → {after}",
    "adm.images.confirm": "Compress {count} image(s) and replace the originals? This cannot be undone.",
    "adm.images.done": "Image compression finished",
  },
});

I18N.init();

const state = {
  me: null,
  section: "overview",
  users: [],
  settings: null,
  logPage: 1,
  logPages: 1,
  terms: [],
  termEdits: new Map(),
};

// ------------------------------------------------------------------ utils

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  let value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  $("#toastStack").appendChild(element);
  setTimeout(() => element.remove(), 3600);
}

async function api(url, { method = "GET", json } = {}) {
  const init = { method, credentials: "same-origin", headers: { "X-Requested-With": "ModelVault" } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, init);
  if (response.status === 401) {
    location.href = `/login.html?next=${encodeURIComponent("/admin.html")}`;
    throw new Error(t("auth.sessionExpired"));
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(I18N.serverError(payload.error || t("error.request", { status: response.status })));
  return payload;
}

async function guard(button, task) {
  if (button) button.disabled = true;
  try {
    return await task();
  } catch (error) {
    toast(error.message, "error");
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint32Array(12));
  let text = Array.from(values, (v) => chars[v % chars.length]).join("");
  if (!/\d/.test(text)) text = text.slice(0, 11) + "7";
  if (!/[a-z]/i.test(text)) text = "k" + text.slice(1);
  return text;
}

function actionLabel(action) {
  const key = `act.${action}`;
  const label = t(key);
  return label === key ? action : label;
}

function applyI18n() {
  document.documentElement.lang = I18N.current === "en" ? "en" : "zh-CN";
  document.title = `${t("adm.console")} · POLYMODEL-Vault`;
  $$("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $$("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  $$("#langSwitch button").forEach((button) => button.classList.toggle("active", button.dataset.lang === I18N.current));
}

// ------------------------------------------------------------------ navigation

// ------------------------------------------------------------------ term translations

// Built-in suggestions for common 3D asset terms. "填充建议" only fills empty fields.
const TERM_GLOSSARY = {
  "角色": "Character", "人物": "Character", "人形": "Humanoid", "生物": "Creature", "怪物": "Monster",
  "动物": "Animal", "宠物": "Pet", "机器人": "Robot", "机甲": "Mecha", "道具": "Prop", "武器": "Weapon",
  "枪械": "Firearm", "刀剑": "Sword", "盔甲": "Armor", "装备": "Equipment", "工具": "Tool", "家具": "Furniture",
  "椅子": "Chair", "桌子": "Table", "沙发": "Sofa", "床": "Bed", "柜子": "Cabinet", "灯具": "Lighting",
  "电器": "Appliance", "电子产品": "Electronics", "厨具": "Kitchenware", "餐具": "Tableware", "容器": "Container",
  "箱子": "Box", "瓶子": "Bottle", "食物": "Food", "饮料": "Drink", "水果": "Fruit", "植物": "Plant",
  "树木": "Tree", "花卉": "Flower", "草": "Grass", "岩石": "Rock", "石头": "Stone", "地形": "Terrain",
  "场景": "Scene", "环境": "Environment", "建筑": "Building", "房屋": "House", "室内": "Interior",
  "室外": "Exterior", "城市": "City", "街道": "Street", "桥梁": "Bridge", "载具": "Vehicle", "车辆": "Vehicle",
  "汽车": "Car", "卡车": "Truck", "摩托车": "Motorcycle", "自行车": "Bicycle", "飞机": "Aircraft",
  "飞船": "Spaceship", "船": "Ship", "坦克": "Tank", "服装": "Clothing", "鞋子": "Shoes", "帽子": "Hat",
  "饰品": "Accessory", "首饰": "Jewelry", "玩具": "Toy", "乐器": "Instrument", "运动": "Sports",
  "医疗": "Medical", "工业": "Industrial", "机械": "Machinery", "机械臂": "Robotic arm", "零件": "Part",
  "设备": "Device", "包装": "Packaging", "标志": "Sign", "雕塑": "Sculpture", "雕像": "Statue",
  "艺术品": "Artwork", "装饰": "Decoration", "特效": "VFX", "粒子": "Particles",
  "科幻": "Sci-fi", "奇幻": "Fantasy", "魔幻": "Fantasy", "中世纪": "Medieval", "古风": "Ancient Chinese",
  "中国风": "Chinese style", "现代": "Modern", "未来": "Futuristic", "复古": "Retro", "赛博朋克": "Cyberpunk",
  "蒸汽朋克": "Steampunk", "末日": "Post-apocalyptic", "军事": "Military", "写实": "Realistic",
  "卡通": "Cartoon", "风格化": "Stylized", "二次元": "Anime", "Q版": "Chibi", "像素": "Pixel",
  "体素": "Voxel", "手绘": "Hand-painted", "低多边形": "Low poly", "低模": "Low poly", "高模": "High poly",
  "中模": "Mid poly", "硬表面": "Hard surface", "有机": "Organic", "雕刻": "Sculpted", "拓扑": "Topology",
  "四边面": "Quad mesh", "三角面": "Triangulated", "PBR": "PBR", "贴图": "Textured", "材质": "Material",
  "金属": "Metal", "木头": "Wood", "木质": "Wooden", "玻璃": "Glass", "塑料": "Plastic", "布料": "Fabric",
  "皮革": "Leather", "陶瓷": "Ceramic", "混凝土": "Concrete", "绑定": "Rigged", "骨骼": "Skeleton",
  "动画": "Animated", "可动": "Articulated", "游戏": "Game", "游戏资产": "Game asset", "影视": "Film",
  "展示": "Showcase", "展厅": "Showroom", "电商": "E-commerce", "广告": "Advertising", "教育": "Education",
  "数字人": "Digital human", "虚拟人": "Virtual human", "扫描": "Scanned", "照片建模": "Photogrammetry",
  "待优化": "Needs optimization", "已优化": "Optimized", "参考": "Reference", "测试": "Test", "其他": "Other",
};

function termUsage(item) {
  const parts = [];
  if (item.tagCount) parts.push(t("adm.terms.tag", { count: item.tagCount }));
  if (item.categoryCount) parts.push(t("adm.terms.category", { count: item.categoryCount }));
  return parts.join(" · ") || "—";
}

function currentEn(item) {
  return state.termEdits.has(item.term) ? state.termEdits.get(item.term) : item.en;
}

function pendingTermChanges() {
  return (state.terms || [])
    .filter((item) => state.termEdits.has(item.term) && state.termEdits.get(item.term) !== item.en)
    .map((item) => ({ term: item.term, en: state.termEdits.get(item.term) }));
}

function renderTermSummary() {
  const items = state.terms || [];
  const done = items.filter((item) => currentEn(item)).length;
  $("#termSummary").textContent = t("adm.terms.summary", { total: items.length, done, missing: items.length - done });
  const missingSaved = items.filter((item) => !item.en).length;
  $("#termsBadge").hidden = !missingSaved;
  $("#termsBadge").textContent = missingSaved;
}

function renderTerms() {
  const query = $("#termSearch").value.trim().toLowerCase();
  const onlyMissing = $("#termUntranslated").checked;
  const rows = (state.terms || []).filter((item) => {
    const en = currentEn(item);
    if (onlyMissing && en) return false;
    return !query || item.term.toLowerCase().includes(query) || en.toLowerCase().includes(query);
  });
  $("#termTable").innerHTML = rows.length
    ? rows
        .map(
          (item) => `<tr class="${currentEn(item) ? "" : "term-missing"}">
            <td><strong>${escapeHtml(item.term)}</strong></td>
            <td class="muted">${escapeHtml(termUsage(item))}</td>
            <td><input class="term-input" data-term="${escapeHtml(item.term)}" maxlength="80" value="${escapeHtml(currentEn(item))}" placeholder="${escapeHtml(t("adm.terms.placeholder"))}"></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="empty">${t("adm.terms.empty")}</td></tr>`;
  renderTermSummary();
}

async function loadTerms() {
  const data = await guard(null, () => api("/api/admin/terms"));
  if (!data) return;
  state.terms = data.items;
  state.termEdits = new Map();
  renderTerms();
}

function suggestTerms() {
  let count = 0;
  (state.terms || []).forEach((item) => {
    if (currentEn(item)) return;
    const suggestion = TERM_GLOSSARY[item.term] || (/^[\x20-\x7e]+$/.test(item.term) ? item.term : "");
    if (suggestion) {
      state.termEdits.set(item.term, suggestion);
      count += 1;
    }
  });
  renderTerms();
  toast(count ? t("adm.terms.suggested", { count }) : t("adm.terms.noSuggest"), count ? "success" : "error");
}

async function saveTerms() {
  const items = pendingTermChanges();
  if (!items.length) {
    toast(t("adm.terms.nothing"));
    return;
  }
  await guard($("#termSaveBtn"), async () => {
    const result = await api("/api/admin/terms", { method: "PUT", json: { items } });
    toast(t("adm.terms.saved", { count: result.updated }));
    await loadTerms();
  });
}

function showSection(section) {
  state.section = section;
  $$("#adminNav button").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  $$("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== section;
  });
  history.replaceState(null, "", `#${section}`);
  ({ overview: loadOverview, users: loadUsers, storage: loadSettings, system: loadSettings, terms: loadTerms, logs: loadLogs })[section]?.();
}

// ------------------------------------------------------------------ overview

function storageLabel(storage) {
  if (storage.backend === "s3") return `AWS S3${storage.source === "env" ? ` · ${t("adm.storage.fromEnv")}` : ""}`;
  if (storage.backend === "local") return t("adm.storage.local");
  return t("adm.storage.none");
}

async function loadOverview() {
  const data = await guard(null, () => api("/api/admin/overview"));
  if (!data) return;
  const { users, assets, storage } = data;
  $("#pendingBadge").hidden = !users.pending;
  $("#pendingBadge").textContent = users.pending;
  const cards = [
    { label: t("adm.stat.users"), value: users.total, note: t("adm.stat.usersNote", users), color: "var(--primary-soft)" },
    { label: t("adm.stat.pending"), value: users.pending, note: t("adm.stat.pendingNote"), color: "var(--warning-soft)" },
    { label: t("adm.stat.assets"), value: assets.total, note: t("adm.stat.assetsNote", assets), color: "var(--accent-soft)" },
    { label: t("adm.stat.glb"), value: formatBytes(assets.glb_size), note: t("adm.stat.glbNote"), color: "#eef1f7" },
  ];
  $("#overviewStats").innerHTML = cards
    .map(
      (card) => `<article class="stat-card" style="--stat-soft:${card.color}">
        <div class="stat-label">${escapeHtml(card.label)}</div>
        <div class="stat-value">${escapeHtml(card.value)}</div>
        <div class="stat-note">${escapeHtml(card.note)}</div></article>`
    )
    .join("");
  const rows = [
    [t("adm.info.database"), data.database === "postgres" ? "PostgreSQL" : "SQLite (local)"],
    [t("adm.info.storage"), storageLabel(storage)],
    [t("adm.info.bucket"), storage.bucket ? `${storage.bucket} · ${storage.region}` : "—"],
    [t("adm.info.registration"), t(`adm.reg.${data.registration}`)],
    [t("adm.info.admins"), users.admins],
  ];
  $("#platformInfo").innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  $("#recentLogs").innerHTML = data.recentLogs.length
    ? data.recentLogs.map(logRowShort).join("")
    : `<tr><td class="empty">${t("adm.logs.empty")}</td></tr>`;
}

function logRowShort(log) {
  return `<tr><td class="muted">${escapeHtml(log.created_at)}</td><td>${escapeHtml(log.username || "—")}</td>
    <td>${escapeHtml(actionLabel(log.action))}</td><td class="muted">${escapeHtml(log.detail || log.target)}</td></tr>`;
}

// ------------------------------------------------------------------ users

async function loadUsers() {
  const params = new URLSearchParams();
  const query = $("#userSearch").value.trim();
  const status = $("#userStatusFilter").value;
  if (query) params.set("query", query);
  if (status) params.set("status", status);
  const data = await guard(null, () => api(`/api/admin/users?${params}`));
  if (!data) return;
  state.users = data.items;
  renderUsers();
}

function permSwitch(user, perm) {
  const isAdmin = user.role === "admin";
  const checked = isAdmin || user[`can_${perm}`];
  return `<label class="switch" title="${escapeHtml(t(`perm.${perm}`))}">
    <input type="checkbox" data-perm="can_${perm}" data-id="${user.id}" ${checked ? "checked" : ""} ${isAdmin ? "disabled" : ""}>
    <span class="track"></span></label>`;
}

function renderUsers() {
  const meId = state.me?.id;
  const rows = state.users.map((user) => {
    const isMe = user.id === meId;
    const pills = [
      user.role === "admin" ? `<span class="pill admin">${t("role.admin")}</span>` : "",
      `<span class="pill ${user.status}">${t(`adm.status.${user.status}`)}</span>`,
      user.locked ? `<span class="pill locked">${t("adm.status.locked")}</span>` : "",
    ].join("");
    const actions = [];
    if (user.status === "pending") actions.push(["approve", t("adm.users.approve"), "btn-mini"]);
    if (!isMe) {
      if (user.status === "disabled") actions.push(["enable", t("adm.users.enable"), "btn-mini"]);
      if (user.status === "active") actions.push(["disable", t("adm.users.disable"), "btn-mini"]);
      actions.push(user.role === "admin" ? ["removeAdmin", t("adm.users.removeAdmin"), "btn-mini"] : ["makeAdmin", t("adm.users.makeAdmin"), "btn-mini"]);
    }
    if (user.locked) actions.push(["unlock", t("adm.users.unlock"), "btn-mini"]);
    actions.push(["reset", t("adm.users.resetPwd"), "btn-mini"]);
    if (!isMe) actions.push(["delete", t("adm.users.delete"), "btn-mini btn-danger-text"]);
    return `<tr>
      <td><strong>${escapeHtml(user.display_name)}</strong>${isMe ? `<span class="muted">${t("adm.users.you")}</span>` : ""}<div class="muted">@${escapeHtml(user.username)} · ${escapeHtml(user.created_at || "")}</div></td>
      <td>${pills}</td>
      <td>${permSwitch(user, "create")}</td>
      <td>${permSwitch(user, "edit")}</td>
      <td>${permSwitch(user, "delete")}</td>
      <td class="muted">${escapeHtml(user.last_login_at || t("adm.users.never"))}</td>
      <td><div class="row-btns">${actions
        .map(([act, label, cls]) => `<button type="button" class="btn ${cls}" data-act="${act}" data-id="${user.id}">${escapeHtml(label)}</button>`)
        .join("")}</div></td>
    </tr>`;
  });
  $("#userTable").innerHTML = rows.length ? rows.join("") : `<tr><td colspan="7" class="empty">${t("adm.users.empty")}</td></tr>`;
}

async function patchUser(id, data) {
  const updated = await api(`/api/admin/users/${id}`, { method: "PATCH", json: data });
  const index = state.users.findIndex((u) => u.id === id);
  if (index >= 0) state.users[index] = updated;
  renderUsers();
  return updated;
}

async function handleUserAction(event) {
  const input = event.target.closest("input[data-perm]");
  if (input && event.type === "change") {
    const id = Number(input.dataset.id);
    await guard(input, async () => {
      await patchUser(id, { [input.dataset.perm]: input.checked });
      toast(t("adm.users.updated"));
    });
    input.checked = Boolean(state.users.find((u) => u.id === id)?.[input.dataset.perm] || state.users.find((u) => u.id === id)?.role === "admin");
    return;
  }
  const button = event.target.closest("button[data-act]");
  if (!button || event.type !== "click") return;
  const id = Number(button.dataset.id);
  const user = state.users.find((u) => u.id === id);
  if (!user) return;
  const act = button.dataset.act;
  await guard(button, async () => {
    if (act === "approve" || act === "enable") await patchUser(id, { status: "active" });
    if (act === "disable") await patchUser(id, { status: "disabled" });
    if (act === "unlock") await patchUser(id, { unlock: true });
    if (act === "makeAdmin") {
      if (!confirm(t("adm.users.adminConfirm", { name: user.display_name }))) return;
      await patchUser(id, { role: "admin" });
    }
    if (act === "removeAdmin") await patchUser(id, { role: "user" });
    if (act === "reset") {
      const password = prompt(t("adm.users.resetPrompt", { name: user.display_name }), randomPassword());
      if (!password) return;
      await api(`/api/admin/users/${id}/reset-password`, { method: "POST", json: { password } });
      toast(t("adm.users.resetDone"));
      return;
    }
    if (act === "delete") {
      if (!confirm(t("adm.users.deleteConfirm", { name: user.display_name }))) return;
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
      await loadUsers();
    }
    toast(t("adm.users.updated"));
  });
}

function openUserModal() {
  $("#userForm").reset();
  $("#userForm").password.value = randomPassword();
  $("#userModal").hidden = false;
  setTimeout(() => $("#userForm").username.focus(), 50);
}

async function createUser() {
  const form = $("#userForm");
  const data = {
    username: form.username.value.trim().toLowerCase(),
    display_name: form.display_name.value.trim(),
    password: form.password.value,
    can_create: form.can_create.checked,
    can_edit: form.can_edit.checked,
    can_delete: form.can_delete.checked,
    role: form.is_admin.checked ? "admin" : "user",
  };
  await guard($("#createUserBtn"), async () => {
    await api("/api/admin/users", { method: "POST", json: data });
    $("#userModal").hidden = true;
    toast(t("adm.users.created"));
    await loadUsers();
  });
}

// ------------------------------------------------------------------ storage & system

function iamPolicy(bucket, prefix) {
  const b = bucket || "YOUR-BUCKET";
  const p = prefix || "";
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketCors", "s3:PutBucketCors"], Resource: `arn:aws:s3:::${b}` },
        { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: `arn:aws:s3:::${b}/${p}*` },
      ],
    },
    null,
    2
  );
}

async function loadSettings() {
  const data = await guard(null, () => api("/api/admin/settings"));
  if (!data) return;
  state.settings = data;
  const s = data.storage;
  const form = $("#storageForm");
  form.bucket.value = s.bucket || "";
  form.region.value = s.region || "";
  form.access_key_id.value = s.access_key_id || "";
  form.secret_access_key.value = "";
  form.secret_access_key.placeholder = s.secret_set ? t("adm.storage.secretSet", { hint: s.secret_hint }) : "";
  form.prefix.value = s.prefix || "";
  form.endpoint.value = s.endpoint || "";
  form.url_hours.value = Math.round((s.url_expires || 43200) / 3600);
  const pill = $("#storageStatePill");
  pill.className = `pill ${s.configured ? "active" : "pending"}`;
  pill.textContent = s.configured ? t("adm.storage.ready") : s.backend === "local" ? t("adm.storage.local") : t("adm.storage.notReady");
  if (!$("#corsOrigins").value.trim()) $("#corsOrigins").value = data.origin;
  $("#iamPolicy").textContent = iamPolicy(s.bucket, s.prefix);
  loadImageStatus();
  const radio = $(`#registrationModes input[value="${data.registration_mode}"]`);
  if (radio) radio.checked = true;
}

function storagePayload() {
  const form = $("#storageForm");
  return {
    bucket: form.bucket.value.trim(),
    region: form.region.value.trim(),
    access_key_id: form.access_key_id.value.trim(),
    secret_access_key: form.secret_access_key.value.trim(),
    prefix: form.prefix.value.trim(),
    endpoint: form.endpoint.value.trim(),
    url_expires: Math.max(1, Number(form.url_hours.value || 12)) * 3600,
  };
}

async function saveStorage() {
  await guard($("#saveStorageBtn"), async () => {
    await api("/api/admin/storage", { method: "PUT", json: storagePayload() });
    toast(t("adm.saved"));
    await loadSettings();
  });
}

async function testStorage() {
  const button = $("#testStorageBtn");
  button.textContent = t("adm.storage.testing");
  await guard(button, async () => {
    await api("/api/admin/storage", { method: "PUT", json: storagePayload() });
    const result = await api("/api/admin/storage/test", { method: "POST" });
    toast(I18N.current === "en" && result.ok ? "Connection OK" : result.message);
    if (result.cors && !result.cors.length) toast(t("adm.storage.corsMissing"), "error");
    await loadSettings();
  });
  button.textContent = t("adm.storage.test");
}

async function applyCors() {
  const origins = $("#corsOrigins").value.split(/[\n,]/).map((o) => o.trim()).filter(Boolean);
  await guard($("#applyCorsBtn"), async () => {
    const result = await api("/api/admin/storage/cors", { method: "POST", json: { origins } });
    $("#corsResult").hidden = false;
    $("#corsResult").textContent = JSON.stringify(result.rules, null, 2);
    toast(t("adm.storage.corsDone"));
  });
}

async function scanUsage() {
  const button = $("#usageBtn");
  button.textContent = t("adm.storage.scanning");
  await guard(button, async () => {
    const data = await api("/api/admin/storage/usage");
    const rows = [
      [t("adm.storage.objects"), `${data.objects}${data.truncated ? "+" : ""}`],
      [t("adm.storage.totalSize"), formatBytes(data.size)],
      ...Object.entries(data.byKind).map(([kind, info]) => {
        const key = `adm.storage.kind.${kind}`;
        const label = t(key) === key ? kind : t(key);
        return [label, `${info.count} · ${formatBytes(info.size)}`];
      }),
      [t("adm.storage.orphans"), t("adm.storage.orphansNote", { count: data.orphans.count, size: formatBytes(data.orphans.size) })],
    ];
    $("#usageInfo").innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  });
  button.textContent = t("adm.storage.scan");
}

async function loadImageStatus() {
  const data = await guard(null, () => api("/api/admin/images/status"));
  if (!data) return null;
  $("#imagesPending").textContent = data.pending ? t("adm.images.count", { count: data.pending }) : t("adm.images.none");
  $("#compressImagesBtn").disabled = !data.pending;
  return data.pending;
}

async function compressImages() {
  const pending = await loadImageStatus();
  if (!pending || !confirm(t("adm.images.confirm", { count: pending }))) return;
  const button = $("#compressImagesBtn");
  button.disabled = true;
  button.textContent = t("adm.images.running");
  const totals = { processed: 0, failed: 0, before: 0, after: 0 };
  let cursor = 0;
  let idleRounds = 0;
  try {
    for (;;) {
      const result = await api("/api/admin/images/compress", { method: "POST", json: { cursor } });
      ["processed", "failed", "before", "after"].forEach((key) => {
        totals[key] += result[key] || 0;
      });
      $("#imagesProgress").textContent = t("adm.images.stat", {
        count: totals.processed,
        failed: totals.failed,
        before: formatBytes(totals.before),
        after: formatBytes(totals.after),
      });
      $("#imagesPending").textContent = result.pending ? t("adm.images.count", { count: result.pending }) : t("adm.images.none");
      if (result.done) break;
      idleRounds = result.cursor === cursor && !result.processed && !result.failed ? idleRounds + 1 : 0;
      if (idleRounds >= 3) break;
      cursor = result.cursor;
    }
    toast(t("adm.images.done"));
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.textContent = t("adm.images.start");
    await loadImageStatus();
  }
}

async function cleanup() {
  if (!confirm(t("adm.storage.cleanupConfirm"))) return;
  await guard($("#cleanupBtn"), async () => {
    const data = await api("/api/admin/storage/cleanup", { method: "POST" });
    toast(t("adm.storage.cleanupDone", { count: data.deleted, size: formatBytes(data.size) }));
    await scanUsage();
  });
}

async function saveSystem() {
  const mode = $("#registrationModes input:checked")?.value;
  if (!mode) return;
  await guard($("#saveSystemBtn"), async () => {
    await api("/api/admin/settings/system", { method: "PUT", json: { registration_mode: mode } });
    toast(t("adm.saved"));
  });
}

// ------------------------------------------------------------------ logs

async function loadLogs() {
  const params = new URLSearchParams({ page: String(state.logPage) });
  const query = $("#logSearch").value.trim();
  const action = $("#logAction").value;
  if (query) params.set("query", query);
  if (action) params.set("action", action);
  const data = await guard(null, () => api(`/api/admin/logs?${params}`));
  if (!data) return;
  state.logPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  $("#logPageInfo").textContent = t("adm.logs.page", { total: data.total, page: data.page, pages: state.logPages });
  $("#logPrev").disabled = data.page <= 1;
  $("#logNext").disabled = data.page >= state.logPages;
  $("#logTable").innerHTML = data.items.length
    ? data.items
        .map(
          (log) => `<tr><td class="muted">${escapeHtml(log.created_at)}</td><td>${escapeHtml(log.username || "—")}</td>
          <td>${escapeHtml(actionLabel(log.action))}</td><td class="muted">${escapeHtml(log.target)}</td>
          <td>${escapeHtml(log.detail)}</td><td class="muted">${escapeHtml(log.ip)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="empty">${t("adm.logs.empty")}</td></tr>`;
}

// ------------------------------------------------------------------ boot

function bindEvents() {
  $("#adminNav").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-section]");
    if (button) showSection(button.dataset.section);
  });
  $$("[data-goto]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.goto)));
  $("#langSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-lang]");
    if (!button) return;
    I18N.set(button.dataset.lang);
    applyI18n();
    showSection(state.section);
  });
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/login.html";
  });

  let timer;
  $("#userSearch").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadUsers, 250);
  });
  $("#userStatusFilter").addEventListener("change", loadUsers);
  $("#userTable").addEventListener("click", handleUserAction);
  $("#userTable").addEventListener("change", handleUserAction);
  $("#newUserBtn").addEventListener("click", openUserModal);
  $("#createUserBtn").addEventListener("click", createUser);
  $$("[data-close]").forEach((button) =>
    button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).hidden = true;
    })
  );

  $("#saveStorageBtn").addEventListener("click", saveStorage);
  $("#testStorageBtn").addEventListener("click", testStorage);
  $("#applyCorsBtn").addEventListener("click", applyCors);
  $("#usageBtn").addEventListener("click", scanUsage);
  $("#cleanupBtn").addEventListener("click", cleanup);
  $("#compressImagesBtn").addEventListener("click", compressImages);
  $("#saveSystemBtn").addEventListener("click", saveSystem);
  $("#termTable").addEventListener("input", (event) => {
    const input = event.target.closest("input[data-term]");
    if (!input) return;
    state.termEdits.set(input.dataset.term, input.value.trim());
    renderTermSummary();
  });
  $("#termSearch").addEventListener("input", renderTerms);
  $("#termUntranslated").addEventListener("change", renderTerms);
  $("#termSuggestBtn").addEventListener("click", suggestTerms);
  $("#termSaveBtn").addEventListener("click", saveTerms);
  window.addEventListener("beforeunload", (event) => {
    if (pendingTermChanges().length) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  $("#logSearch").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.logPage = 1;
      loadLogs();
    }, 250);
  });
  $("#logAction").addEventListener("change", () => {
    state.logPage = 1;
    loadLogs();
  });
  $("#logPrev").addEventListener("click", () => {
    state.logPage = Math.max(1, state.logPage - 1);
    loadLogs();
  });
  $("#logNext").addEventListener("click", () => {
    state.logPage = Math.min(state.logPages, state.logPage + 1);
    loadLogs();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("#userModal").hidden = true;
  });
  window.addEventListener("hashchange", () => {
    const section = location.hash.slice(1);
    if (section && section !== state.section && $(`[data-panel="${section}"]`)) showSection(section);
  });
}

async function boot() {
  applyI18n();
  let me;
  try {
    me = (await api("/api/auth/me")).user;
  } catch {
    return;
  }
  if (!me.is_admin) {
    location.href = "/";
    return;
  }
  state.me = me;
  $("#userName").textContent = me.display_name;
  $("#userAvatar").textContent = me.display_name.slice(0, 1).toUpperCase();
  document.body.classList.remove("booting");
  bindEvents();
  const initial = location.hash.slice(1);
  showSection(["overview", "users", "storage", "terms", "system", "logs"].includes(initial) ? initial : "overview");
  if (initial !== "overview") loadOverview();
}

boot();
