# 部署到 Vercel（Neon Postgres + AWS S3）

整个过程大约 20 分钟，分 5 步。

## 第 1 步：准备 AWS S3

1. 登录 AWS 控制台 → **S3** → **Create bucket**
   - Bucket 名称：例如 `modelvault-assets-xxxx`（全局唯一，建议不要带 `.`）
   - Region：选离团队最近的区域，例如 `ap-east-1`（香港）、`ap-southeast-1`（新加坡）、`ap-northeast-1`（东京）
   - **Block all public access：保持勾选**（存储桶是私有的，平台通过签名链接访问）
2. **IAM** → **Users** → **Create user**（例如 `modelvault-app`，不需要控制台登录权限）
   - 权限选 *Attach policies directly* → *Create policy* → JSON，粘贴下面的策略（把 `YOUR-BUCKET` 换成你的桶名，`modelvault/` 是默认路径前缀）：

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:ListBucket", "s3:GetBucketCors", "s3:PutBucketCors"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET/modelvault/*"
       }
     ]
   }
   ```

3. 打开该用户 → **Security credentials** → **Create access key**（用途选 *Application running outside AWS*），记下 **Access Key ID** 和 **Secret Access Key**。

CORS 不需要手动配置，部署后在管理后台一键写入即可。

如果 S3 已启用或暂停版本控制，应用账号需要额外的 `s3:ListBucketVersions`（桶）和 `s3:DeleteObjectVersion`（资产路径）权限，才能从回收站彻底删除文件及历史版本。

## 第 2 步：把代码推到 GitHub

Vercel 从 Git 仓库部署。把本项目推送到你的 GitHub（私有仓库即可）。

## 第 3 步：在 Vercel 创建项目

1. 打开 <https://vercel.com/new>，导入上一步的仓库。
2. **Framework Preset** 选 **Flask**（通常会自动识别；根目录的 `app.py` 就是入口）。Build / Output 设置保持默认。
3. 先不要点 Deploy，展开 **Environment Variables**，添加：

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `SECRET_KEY` | 一串 ≥ 32 位的随机字符 | **必填**。用于登录 Cookie 签名和加密 S3 密钥。上线后不要更换 |
| `ADMIN_USERNAME` | 例如 `admin` | 首个管理员用户名 |
| `ADMIN_PASSWORD` | 一个强密码 | 首个管理员密码（至少 8 位，含字母和数字） |
| `APP_TIMEZONE` | `Asia/Shanghai` | 可选，界面显示的时区 |

生成随机 `SECRET_KEY` 的方法（本地 PowerShell）：

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

4. 点击 **Deploy**。第一次部署会因为还没有数据库而报错，这是正常的，继续下一步。

## 第 4 步：添加免费的 Postgres 数据库

1. 进入 Vercel 项目 → **Storage** → **Create Database** → 选择 **Neon (Serverless Postgres)** → 免费套餐（Free）。
2. Region 选与 S3 接近的区域，**Connect** 到当前项目（勾选 Production / Preview / Development）。
3. Vercel 会自动注入 `DATABASE_URL`、`POSTGRES_URL` 等环境变量。
4. 回到 **Deployments**，对最新一次部署点 **Redeploy**。

表结构和首个管理员会在第一次请求时自动创建，无需手动执行 SQL。部署完成后访问 `https://你的域名/api/health`，应返回 `{"ok": true, "database": "postgres"}`。

## 第 5 步：在管理后台配置 S3

1. 打开 `https://你的域名/login.html`，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。
2. 右上角头像 → **管理后台** → **存储设置**：
   - 填写 Bucket、Region、Access Key ID、Secret Access Key → **测试连接**（会自动保存）
   - 右侧 **跨域 (CORS) 配置**：默认已填好当前域名；如果还绑定了自定义域名，每行加一个 → **写入 CORS 规则**
3. **系统设置** 选择注册方式（开放 / 需审核 / 关闭）。
4. **用户管理** 中给发起人开“创建任务”，给制作人开“编辑 / 提交成果”，给负责人开“删除任务”。

> S3 也可以改用环境变量配置：`S3_BUCKET`、`S3_REGION`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PREFIX`。后台填写的配置优先。

## 迁移旧版本地数据（可选）

在保存着旧数据（`data/assets.sqlite3` 和 `data/uploads/`）的电脑上，从 Vercel 项目 **Settings → Environment Variables** 复制 `DATABASE_URL` 和 `SECRET_KEY`，然后：

```powershell
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql://..."
$env:SECRET_KEY = "与 Vercel 上相同的值"
python scripts/migrate_local.py --dry-run
python scripts/migrate_local.py --owner admin
```

脚本会把文件上传到后台配置的 S3，并写入线上数据库；重复运行会跳过已迁移的条目。

## 常见问题

**上传时提示“网络错误或存储桶未配置 CORS”**
在后台“存储设置”中写入 CORS 规则，并确认填写的域名与浏览器地址栏完全一致（包括 `https://`，不带结尾 `/`）。Vercel 的预览部署域名不同，需要的话也加进去。

**模型或图片加载失败**
同上，多半是 CORS；也可能是链接过期（页面开了超过“访问链接有效期”），刷新页面即可。

**忘记管理员密码**
让另一位管理员在后台重置。如果没有其他管理员：在 Neon 控制台执行 `UPDATE users SET role='user' WHERE username='admin';` 后，修改 Vercel 上的 `ADMIN_USERNAME` 为一个新用户名并 Redeploy——当系统中没有管理员时会按环境变量重新创建。

**更换了 `SECRET_KEY`**
所有用户需要重新登录；后台保存的 S3 Secret Key 无法解密，需要重新填写。

**免费额度**
Neon 免费版 0.5 GB 存储对于元数据足够（每条资产不到 1 KB）。Vercel Hobby 免费版仅限个人非商业用途，团队商用请使用 Pro。S3 按实际存储量和流量计费。
