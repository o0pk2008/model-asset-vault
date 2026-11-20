# POLYMODEL-Vault 模型资产库 · 在线版

团队 3D 模型资产管理平台，围绕“发起人建任务、制作人补成果”的流程设计。支持参考照片、制作截图和 GLB 的粘贴 / 拖拽上传、表格与卡片视图、在线 3D 预览与下载。

在线版新增：

- **账号注册与登录**：注册方式可设为开放 / 需审核 / 关闭；登录失败锁定；个人修改密码
- **权限管理**：默认账号只能查看和下载；「创建任务」「编辑 / 提交成果」「删除任务」三项权限分别授权
- **管理后台** `/admin.html`：用户管理、AWS S3 存储设置（测试连接、一键 CORS、用量统计、孤立文件清理）、注册方式、操作日志
- **部署**：Vercel（Flask）+ Neon Postgres（Vercel 免费数据库）+ AWS S3，浏览器直传 S3，支持最大 1 GB 的 GLB

完整需求见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)，部署步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 项目结构

```
app.py               Vercel 入口 / 本地启动脚本（导出 Flask app）
server/
  __init__.py        应用工厂、CSRF 校验、错误处理
  config.py          环境变量配置
  db.py              Postgres / SQLite 数据层与表结构
  auth.py            注册、登录、会话、权限装饰器
  assets.py          资产（任务）接口、上传签名、下载
  admin.py           管理后台接口
  storage.py         S3 预签名上传 / 访问链接、本地开发存储
  audit.py           操作日志
public/              静态页面（Vercel CDN 直接托管）
  index.html         资产库
  login.html         登录 / 注册
  admin.html         管理后台
  static/            JS、CSS、model-viewer、HDR 环境光
scripts/
  migrate_local.py   旧版本地数据迁移到线上
vercel.json          Vercel 函数配置
.env.example         环境变量说明
```

## 本地开发

Windows 双击 `start.bat`，或手动：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "admin12345"
.\.venv\Scripts\python.exe app.py
```

打开 <http://127.0.0.1:8765>，用上面的管理员账号登录。

不设置 `DATABASE_URL` 时使用 `data/vault.sqlite3`；后台没有配置 S3 时，文件保存在 `data/storage/`（仅限本地开发，Vercel 上必须配置 S3）。设置了 `DATABASE_URL` 或在后台填写 S3 后，本地也会直接连线上资源。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `SECRET_KEY` | 线上必填 | 会话签名与 S3 密钥加密；本地未设置时自动生成到 `data/.dev_secret_key` |
| `DATABASE_URL` / `POSTGRES_URL` | 线上必填 | Postgres 连接串，Vercel 集成 Neon 后自动注入 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 首次必填 | 系统中没有管理员时自动创建 |
| `S3_BUCKET` `S3_REGION` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` `S3_PREFIX` `S3_ENDPOINT` | 可选 | S3 也可在后台填写，后台优先 |
| `APP_TIMEZONE` | 可选 | 默认 `Asia/Shanghai` |
| `MAX_GLB_MB` | 可选 | GLB 大小上限，默认 1024 |
| `SESSION_DAYS` | 可选 | 登录有效天数，默认 7 |

## 协作流程

1. **发起人**（需「创建任务」权限）：点击“新增资产”，填写名称、编号等信息，粘贴参考照片后保存，任务进入“待制作”。
2. **制作人**（需「编辑 / 提交成果」权限）：在待制作任务上点“编辑”，进入成果录入视图，上传制作截图与 GLB；上传 GLB 后状态自动变为“已完成”。
3. **所有成员**：在线预览 3D 模型、下载 GLB。
4. **负责人**（需「删除任务」权限）：删除任务，相关文件会从 S3 一并删除。
