# MeshPilot

[English](README.en.md) · [构建记录](https://github.com/StevenssW/MeshPilot/actions/workflows/build.yml)

MeshPilot 是面向网页 3D 资产的浏览器工具。它用 Meshoptimizer 简化三角网格，在同步视角下预览几何和贴图变化，并导出可用于网页的 GLB。导入的模型和贴图在浏览器本地处理。

![MeshPilot 内置模型的原始与简化对比](docs/images/workbench.png)

## 快速开始

建议使用 Node.js 24。项目的最低兼容要求为 Node.js 20.19（20.x）或 22.12 及以上。

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。页面会自动显示内置模型，可直接试用减面和线框对比。

构建和预览静态产物：

```sh
npm run build
npm run preview
```

预览地址为 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。生成的 `dist/` 可部署到网站根目录。

## 操作流程

| 步骤 | 操作 |
| --- | --- |
| 导入 | 点击导入或拖入 GLB、OBJ、STL。 |
| 减面 | 设置目标保留比例和误差上限，运行简化。默认保护法线、UV 接缝和开放边界。 |
| 检查 | 旋转或放大任一视窗，同步检查两侧。可切换线框或仅看几何。 |
| 压缩贴图 | 选择最长边 512、1024、2048 或 4096 px，调整颜色质量，点击「预览并应用」。两侧使用同一个简化网格，也可逐张对比贴图。 |
| 导出 | 下载 GLB，文件包含当前简化结果和已预览的贴图。 |

贴图按原比例缩小，低于尺寸上限的贴图不会被放大。不透明颜色贴图可做 JPEG 压缩。调整尺寸时，法线、材质数据和透明贴图使用 PNG。选用原始贴图时，会直接封装兼容的内嵌图像编码。

## 格式与适用范围

- **GLB** 支持静态三角网格、内嵌贴图和 `EXT_meshopt_compression` 输入。OBJ、STL 按几何导入。
- 导出包含减面后的几何、变换和支持的材质。骨骼、形变目标、GPU 实例和动画不在当前工作流内。
- 实际面数受误差上限、边界和 UV 接缝影响。表面检查覆盖部分拓扑和 UV 问题，最终效果可在同步视窗内检查。

## 代码结构

- `src/model.js` 负责导入、收集顶点属性及重建几何。
- `src/simplify.worker.js` 在 Web Worker 中调用 Meshoptimizer。表面检查与 UV 接缝保护分别位于 `src/surface.js` 和 `src/uv-seams.js`。
- `src/textures.js` 负责贴图缩放、编码及 GLB 导出，`src/texture-controls.js` 负责贴图预览交互。
- `src/view.js` 负责 Three.js 渲染和视角同步。GitHub Actions 在推送和拉取请求时验证生产构建。

## 致谢

MeshPilot 使用 [Meshoptimizer](https://github.com/zeux/meshoptimizer) 的 WebAssembly 模块、[Three.js](https://threejs.org/) 和 [Vite](https://vite.dev/)。
