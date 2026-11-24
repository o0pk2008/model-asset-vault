# MeshPilot

[简体中文](README.md)

MeshPilot is a browser workbench for preparing 3D assets for the web. Simplify triangle meshes with Meshoptimizer, inspect geometry and texture changes in synchronized views, and export the result as GLB. Models and images are processed locally in the browser.

![MeshPilot comparing the original and simplified built-in mesh](docs/images/workbench.png)

## Run locally

Node.js 24 is recommended. The project requires Node.js 20.19 or later in the 20.x line, or 22.12 and later.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) and try the built-in model. Run `npm run build` to generate `dist/` for static hosting at the website root. Run `npm run preview` to preview that build on [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

## Workflow

1. Drag in a GLB, OBJ, or STL. Use GLB for embedded textures.
2. Set the target triangle ratio and error limit. Surface, boundary, and material appearance protection are enabled by default.
3. Orbit, zoom, or pan either viewport to inspect both models. Switch to wireframe or geometry-only view to inspect the mesh.
4. Choose a texture long-edge limit of 512, 1024, 2048, or 4096 px and preview the result. Both views use the same simplified mesh so you can isolate texture changes. Inspect individual maps for a closer comparison.
5. Download the GLB with the simplified mesh and the textures from the preview.

Images keep their aspect ratio and are never upscaled. Opaque color maps use adjustable JPEG quality. Resized normal, material-data, and transparent maps use PNG. Keeping the original texture setting reuses compatible embedded image bytes when available.

MeshPilot targets static triangle meshes. GLB input supports embedded textures and `EXT_meshopt_compression`. OBJ and STL are imported as geometry. The result may retain more triangles than requested when error or protection settings limit simplification.

## Credits

Built with [Meshoptimizer](https://github.com/zeux/meshoptimizer), [Three.js](https://threejs.org/), and [Vite](https://vite.dev/).
