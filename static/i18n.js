(function () {
  const messages = {
    zh: {
      "app.title": "模型资产库",
      "brand.sub": "本地模型资产管理",
      "common.help": "快捷说明",
      "common.cancel": "取消",
      "common.close": "关闭",
      "common.refresh": "刷新",
      "common.create": "新增资产",
      "common.edit": "编辑",
      "common.download": "下载 GLB",
      "common.delete": "删除",
      "common.preview": "预览模型",
      "common.all": "全部",
      "common.none": "—",
      "common.unknown": "未填写",
      "common.resultCount": "{count} 项",
      "lang.label": "界面语言",

      "hero.eyebrow": "ASSET LIBRARY",
      "hero.title": "模型资产库",
      "hero.desc": "发起人粘贴参考照片创建条目，制作人查看照片后补充制作截图与 GLB，任务的每一步都清晰可见。",

      "stat.total": "资产总数",
      "stat.totalNote": "全部制作任务",
      "stat.pending": "待制作",
      "stat.pendingNote": "等待制作人接手",
      "stat.completed": "已完成",
      "stat.completedNote": "已补充模型成果",
      "stat.size": "模型总大小",
      "stat.sizeNote": "GLB 文件合计",

      "filter.search": "搜索名称、编号、标签或描述…",
      "filter.categoryAll": "全部分类",
      "filter.statusAll": "全部",
      "filter.reset": "重置",
      "view.table": "表格",
      "view.card": "卡片",
      "card.autoRotate": "自动旋转",
      "card.noModel": "暂无 GLB 模型",
      "sort.updated": "最近更新",
      "sort.created": "最近创建",
      "sort.nameAsc": "名称升序",
      "sort.nameDesc": "名称降序",
      "sort.size": "文件最大",

      "table.photo": "参考照片",
      "table.screenshot": "制作截图",
      "table.info": "资产信息",
      "table.category": "分类 / 标签",
      "table.status": "状态",
      "table.glb": "GLB 文件",
      "table.updated": "更新时间",
      "table.actions": "操作",
      "table.unnumbered": "未编号",
      "table.uncategorized": "未分类",
      "table.noModel": "未上传",
      "table.byCreator": "发起",
      "table.byMaker": "制作",
      "table.clickZoom": "点击放大查看",

      "empty.title": "还没有匹配的资产",
      "empty.filtered": "试试调整搜索关键词或筛选条件。",
      "empty.default": "先由发起人粘贴参考照片创建条目，制作人再点击“编辑”补充截图与 GLB。",
      "empty.create": "新增第一个资产",

      "status.pending": "待制作",
      "status.producing": "制作中",
      "status.reviewing": "待审核",
      "status.completed": "已完成",
      "status.archived": "已归档",

      "editor.kicker": "ASSET EDITOR",
      "editor.createTitle": "新增资产",
      "editor.editTitle": "编辑资产",
      "editor.completionTitle": "录入制作成果",
      "editor.modeBasic": "基础信息",
      "editor.modeCompletion": "制作成果",
      "editor.saveCreate": "保存资产",
      "editor.saveEdit": "保存修改",
      "editor.saveCompletion": "保存成果",
      "editor.saving": "保存中…",
      "editor.name": "模型名称",
      "editor.namePlaceholder": "例如：工业机械臂 A-01",
      "editor.code": "资产编号",
      "editor.codePlaceholder": "例如：MDL-001",
      "editor.creator": "发起人",
      "editor.creatorPlaceholder": "记录创建这条任务的人",
      "editor.category": "分类",
      "editor.categoryPlaceholder": "例如：角色 / 道具 / 建筑",
      "editor.status": "状态",
      "editor.tags": "标签",
      "editor.tagsPlaceholder": "用逗号分隔，例如：科幻, 硬表面, PBR",
      "editor.description": "描述",
      "editor.descriptionPlaceholder": "补充用途、版本、备注等信息",
      "editor.maker": "制作人",
      "editor.makerPlaceholder": "填写制作人姓名，便于追溯",
      "editor.makerStatus": "制作状态",
      "editor.task": "制作任务",
      "editor.reference": "发起人提供的参考照片",
      "editor.number": "编号",
      "editor.requirements": "要求",
      "editor.noRequirements": "暂无补充说明",
      "editor.viewLarge": "查看大图 ↗",
      "editor.fileCreate": "参考照片",
      "editor.fileEdit": "图片与模型文件",
      "editor.fileCompletion": "制作成果",
      "editor.fileHint": "支持粘贴、选择和拖拽",
      "editor.fileCompletionHint": "截图与 GLB 会归入这条任务",
      "editor.photo": "参考照片",
      "editor.screenshot": "制作截图",
      "editor.glb": "GLB 模型资产",
      "editor.noFile": "未选择文件",
      "editor.selectImage": "选择图片",
      "editor.selectGlb": "选择 GLB",
      "editor.remove": "移除",
      "editor.glbPlaceholder": "选择 .glb 文件或拖入此处",
      "editor.autoComplete": "上传 GLB 后状态会自动变为“已完成”，无需手动修改。",
      "editor.existingImage": "已有图片",
      "editor.existingGlb": "已有 GLB",
      "editor.pasteTitle": "粘贴提示",
      "editor.pasteHint": "发起人在这里粘贴参考照片；制作人打开成果录入后粘贴制作截图与 GLB。点击上传卡片后再按 <kbd>Ctrl</kbd> + <kbd>V</kbd> 可指定目标位置，剪贴板中的 .glb 文件也会自动识别。",

      "detail.kicker": "3D PREVIEW",
      "detail.title": "模型预览",
      "detail.placeholder": "该资产尚未上传 GLB 文件",
      "detail.loading": "模型加载中…",
      "detail.referencePhoto": "参考照片",
      "detail.modelPreview": "模型预览",
      "detail.noReference": "该资产没有参考照片",
      "detail.resize": "拖拽调整照片与模型区域宽度",
      "detail.category": "分类",
      "detail.creator": "发起人",
      "detail.maker": "制作人",
      "detail.tags": "标签",
      "detail.glbSize": "GLB 大小",
      "detail.createdAt": "创建时间",
      "detail.completedAt": "完成时间",
      "detail.updatedAt": "更新时间",
      "detail.description": "描述",
      "detail.noDescription": "暂无描述",
      "detail.download": "下载 GLB",
      "detail.close": "关闭",

      "image.kicker": "IMAGE PREVIEW",
      "image.title": "预览",
      "image.openNew": "新窗口打开",

      "help.kicker": "QUICK GUIDE",
      "help.title": "快捷说明",
      "help.line1": "<strong>发起人：</strong>点击“新增资产”，填写名称、编号和描述，粘贴参考照片后保存。条目会自动进入“待制作”。",
      "help.line2": "<strong>制作人：</strong>在待制作任务中点击“编辑”即可进入成果录入视图，左侧查看参考照片，右侧填写制作人并上传制作截图与 GLB；也可在面板顶部切换“基础信息 / 制作成果”。",
      "help.line3": "上传 GLB 后状态会自动变为“已完成”，并记录完成时间；未上传 GLB 的任务保持“待制作”。",
      "help.line4": "复制图片后按 <kbd>Ctrl</kbd> + <kbd>V</kbd> 可直接粘贴；先点击上传卡片可指定目标位置。GLB 也支持选择和拖拽上传。",
      "help.line5": "状态筛选只有“全部 / 待制作 / 已完成”三种，便于快速查看任务进度。",
      "help.line6": "数据保存在项目目录的 data/assets.sqlite3，文件保存在 data/uploads/。",
      "help.close": "知道了",

      "toast.notFound": "未找到该资产",
      "toast.invalidGlb": "GLB 位置只接受 .glb 文件",
      "toast.invalidImage": "图片位置只接受图片文件",
      "toast.ready": "{label}已就绪：{name}",
      "toast.removed": "已移除文件，保存后生效",
      "toast.imported": "已导入 {count} 个文件",
      "toast.noFiles": "没有识别到可导入的图片或 GLB 文件",
      "toast.nameRequired": "请填写模型名称",
      "toast.savedCompletion": "制作成果已保存",
      "toast.updated": "资产已更新",
      "toast.created": "资产已创建",
      "toast.deleted": "资产已删除",
      "toast.refreshed": "列表已刷新",
      "toast.glbFailed": "GLB 模型加载失败，请检查文件是否完整",
      "confirm.delete": "确定删除「{name}」吗？相关图片和 GLB 文件也会一并删除。",

      "error.fileTooLarge": "文件过大，请上传小于 1GB 的文件",
      "error.server": "服务器错误：{message}",
      "error.unsupported": "不支持的文件类型：{name}",
      "error.noGlb": "该资产没有 GLB 文件",
      "error.request": "请求失败（{status}）"
    },

    en: {
      "app.title": "Model Asset Library",
      "brand.sub": "Local 3D asset management",
      "common.help": "Quick guide",
      "common.cancel": "Cancel",
      "common.close": "Close",
      "common.refresh": "Refresh",
      "common.create": "New asset",
      "common.edit": "Edit",
      "common.download": "Download GLB",
      "common.delete": "Delete",
      "common.preview": "Preview model",
      "common.all": "All",
      "common.none": "—",
      "common.unknown": "Not set",
      "common.resultCount": "{count} items",
      "lang.label": "Language",

      "hero.eyebrow": "ASSET LIBRARY",
      "hero.title": "Model Asset Library",
      "hero.desc": "Requesters create tasks with reference photos. Modelers review the photos, then add production screenshots and GLB files. Every step stays visible.",

      "stat.total": "Total assets",
      "stat.totalNote": "All production tasks",
      "stat.pending": "To do",
      "stat.pendingNote": "Waiting for a modeler",
      "stat.completed": "Completed",
      "stat.completedNote": "Models delivered",
      "stat.size": "Model storage",
      "stat.sizeNote": "Total GLB file size",

      "filter.search": "Search name, code, tags or description…",
      "filter.categoryAll": "All categories",
      "filter.statusAll": "All",
      "filter.reset": "Reset",
      "view.table": "Table",
      "view.card": "Cards",
      "card.autoRotate": "Auto-rotate",
      "card.noModel": "No GLB model",
      "sort.updated": "Recently updated",
      "sort.created": "Recently created",
      "sort.nameAsc": "Name A–Z",
      "sort.nameDesc": "Name Z–A",
      "sort.size": "Largest file",

      "table.photo": "Reference photo",
      "table.screenshot": "Production screenshot",
      "table.info": "Asset info",
      "table.category": "Category / Tags",
      "table.status": "Status",
      "table.glb": "GLB file",
      "table.updated": "Updated",
      "table.actions": "Actions",
      "table.unnumbered": "No code",
      "table.uncategorized": "Uncategorized",
      "table.noModel": "Not uploaded",
      "table.byCreator": "By",
      "table.byMaker": "Modeler",
      "table.clickZoom": "Click to enlarge: ",

      "empty.title": "No matching assets",
      "empty.filtered": "Try adjusting your search or filters.",
      "empty.default": "Create a task with a reference photo first, then use Edit to add the screenshot and GLB.",
      "empty.create": "Create first asset",

      "status.pending": "To do",
      "status.producing": "In progress",
      "status.reviewing": "In review",
      "status.completed": "Completed",
      "status.archived": "Archived",

      "editor.kicker": "ASSET EDITOR",
      "editor.createTitle": "New asset",
      "editor.editTitle": "Edit asset",
      "editor.completionTitle": "Add production result",
      "editor.modeBasic": "Basic info",
      "editor.modeCompletion": "Production result",
      "editor.saveCreate": "Create asset",
      "editor.saveEdit": "Save changes",
      "editor.saveCompletion": "Save result",
      "editor.saving": "Saving…",
      "editor.name": "Model name",
      "editor.namePlaceholder": "e.g. Industrial robot arm A-01",
      "editor.code": "Asset code",
      "editor.codePlaceholder": "e.g. MDL-001",
      "editor.creator": "Requester",
      "editor.creatorPlaceholder": "Who created this task",
      "editor.category": "Category",
      "editor.categoryPlaceholder": "e.g. Character / Prop / Building",
      "editor.status": "Status",
      "editor.tags": "Tags",
      "editor.tagsPlaceholder": "Comma separated, e.g. sci-fi, hard surface, PBR",
      "editor.description": "Description",
      "editor.descriptionPlaceholder": "Usage, version, notes and other details",
      "editor.maker": "Modeler",
      "editor.makerPlaceholder": "Who produced this model",
      "editor.makerStatus": "Production status",
      "editor.task": "Production task",
      "editor.reference": "Reference photo from requester",
      "editor.number": "Code",
      "editor.requirements": "Requirements",
      "editor.noRequirements": "No additional notes",
      "editor.viewLarge": "View full size ↗",
      "editor.fileCreate": "Reference photo",
      "editor.fileEdit": "Images and model file",
      "editor.fileCompletion": "Production result",
      "editor.fileHint": "Paste, select or drag files here",
      "editor.fileCompletionHint": "Screenshots and GLB will be saved to this task",
      "editor.photo": "Reference photo",
      "editor.screenshot": "Production screenshot",
      "editor.glb": "GLB model asset",
      "editor.noFile": "No file selected",
      "editor.selectImage": "Choose image",
      "editor.selectGlb": "Choose GLB",
      "editor.remove": "Remove",
      "editor.glbPlaceholder": "Choose a .glb file or drag it here",
      "editor.autoComplete": "Uploading a GLB automatically sets the status to Completed. No manual change is needed.",
      "editor.existingImage": "Existing image",
      "editor.existingGlb": "Existing GLB",
      "editor.pasteTitle": "Paste tip",
      "editor.pasteHint": "Requesters paste the reference photo here. Modelers paste screenshots and GLB in the result view. Click an upload card then press <kbd>Ctrl</kbd> + <kbd>V</kbd> to choose the target; .glb files from the clipboard are also detected.",

      "detail.kicker": "3D PREVIEW",
      "detail.title": "Model preview",
      "detail.placeholder": "No GLB file uploaded for this asset",
      "detail.loading": "Loading model…",
      "detail.referencePhoto": "Reference photo",
      "detail.modelPreview": "3D model",
      "detail.noReference": "No reference photo for this asset",
      "detail.resize": "Drag to resize the photo and model panes",
      "detail.category": "Category",
      "detail.creator": "Requester",
      "detail.maker": "Modeler",
      "detail.tags": "Tags",
      "detail.glbSize": "GLB size",
      "detail.createdAt": "Created",
      "detail.completedAt": "Completed",
      "detail.updatedAt": "Updated",
      "detail.description": "Description",
      "detail.noDescription": "No description",
      "detail.download": "Download GLB",
      "detail.close": "Close",

      "image.kicker": "IMAGE PREVIEW",
      "image.title": "Preview",
      "image.openNew": "Open in new tab",

      "help.kicker": "QUICK GUIDE",
      "help.title": "Quick guide",
      "help.line1": "<strong>Requester:</strong> click New asset, fill in the name, code and description, paste a reference photo and save. The task is set to To do automatically.",
      "help.line2": "<strong>Modeler:</strong> click Edit on a To do task to open the result view. Review the reference photo on the left, enter the modeler name and upload the screenshot and GLB on the right. Use the tabs at the top to switch between Basic info and Production result.",
      "help.line3": "Uploading a GLB automatically sets the status to Completed and records the completion time. Tasks without a GLB stay To do.",
      "help.line4": "Copy an image and press <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste it. Click an upload card first to choose the target. GLB files can also be selected or dragged in.",
      "help.line5": "The status filter has only All, To do and Completed, making it easy to check task progress.",
      "help.line6": "Data is stored in data/assets.sqlite3, and uploaded files in data/uploads/.",
      "help.close": "Got it",

      "toast.notFound": "Asset not found",
      "toast.invalidGlb": "Only .glb files are accepted here",
      "toast.invalidImage": "Only image files are accepted here",
      "toast.ready": "{label} ready: {name}",
      "toast.removed": "File removed. Save to apply.",
      "toast.imported": "{count} file(s) imported",
      "toast.noFiles": "No supported images or GLB files detected",
      "toast.nameRequired": "Please enter a model name",
      "toast.savedCompletion": "Production result saved",
      "toast.updated": "Asset updated",
      "toast.created": "Asset created",
      "toast.deleted": "Asset deleted",
      "toast.refreshed": "List refreshed",
      "toast.glbFailed": "Failed to load GLB. Please check whether the file is valid.",
      "confirm.delete": "Delete \"{name}\"? Its images and GLB file will also be removed.",

      "error.fileTooLarge": "File too large. Please upload a file smaller than 1 GB.",
      "error.server": "Server error: {message}",
      "error.unsupported": "Unsupported file type: {name}",
      "error.noGlb": "This asset has no GLB file",
      "error.request": "Request failed ({status})"
    }
  };

  const statusKeys = {
    "待制作": "status.pending",
    "制作中": "status.producing",
    "待审核": "status.reviewing",
    "已完成": "status.completed",
    "已归档": "status.archived"
  };

  const serverErrors = [
    ["请填写模型名称", "toast.nameRequired"],
    ["资产不存在", "toast.notFound"],
    ["该资产没有 GLB 文件", "error.noGlb"],
    ["文件过大，请上传小于 1GB 的文件", "error.fileTooLarge"]
  ];

  function format(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars || {}, key) ? vars[key] : match
    );
  }

  function translate(lang, key, vars) {
    const table = messages[lang] || messages.zh;
    const template = table[key] ?? messages.zh[key] ?? key;
    return format(template, vars);
  }

  let current = "zh";

  window.I18N = {
    languages: ["zh", "en"],
    get current() {
      return current;
    },
    set(lang) {
      current = messages[lang] ? lang : "zh";
      try {
        localStorage.setItem("asset_lang", current);
      } catch (_error) {
        // Storage may be unavailable; the UI still works for this session.
      }
      return current;
    },
    init() {
      let saved = "zh";
      try {
        saved = localStorage.getItem("asset_lang") || "zh";
      } catch (_error) {
        saved = "zh";
      }
      current = messages[saved] ? saved : "zh";
      return current;
    },
    t(key, vars) {
      return translate(current, key, vars);
    },
    status(value) {
      const key = statusKeys[value];
      return key ? translate(current, key) : value || "";
    },
    serverError(message) {
      const text = String(message || "");
      if (current === "en") {
        const unsupported = text.match(/^不支持的文件类型：(.+)$/);
        if (unsupported) return translate(current, "error.unsupported", { name: unsupported[1] });
        const server = text.match(/^服务器错误：(.+)$/);
        if (server) return translate(current, "error.server", { message: server[1] });
        const exact = serverErrors.find(([zh]) => zh === text);
        if (exact) return translate(current, exact[1]);
      }
      return text;
    }
  };
})();
