function slideshowMaterialEffect(viewer) {
  const blend = { value: 0 };
  const materials = new Set();
  let redraw;
  let prepared = false;

  function prepare() {
    if (prepared) return;
    prepared = true;
    // The bundled model-viewer wraps Three materials. Use its bridge so white mode
    // preserves the model's geometry, vertex colors, and alpha cutouts on restore.
    for (const facade of viewer.model?.materials || []) {
      if (!facade.isLoaded || !facade.isActive) continue;
      const keys = Object.getOwnPropertySymbols(facade);
      const objects = keys.find((key) => key.description === "correlatedObjects");
      const update = keys.find((key) => key.description === "onUpdate");
      if (update) redraw = () => facade[update]();
      for (const material of facade[objects] || []) materials.add(material);
    }

    for (const material of materials) {
      const original = material.onBeforeCompile;
      material.onBeforeCompile = function (shader, renderer) {
        original.call(this, shader, renderer);
        const output = "#include <tonemapping_fragment>";
        if (!shader.fragmentShader.includes(output)) return;
        shader.uniforms.slideshowWhite = blend;
        shader.fragmentShader = "uniform float slideshowWhite;\n" + shader.fragmentShader;
        let shading = "0.86";
        if (shader.fragmentShader.includes("#include <normal_fragment_begin>")) {
          shading = "0.56 + 0.44 * max(dot(nonPerturbedNormal, normalize(vec3(-0.4, 0.65, 1.0))), 0.0)";
        } else if (material.isMeshBasicMaterial) {
          const project = "#include <project_vertex>";
          shader.vertexShader = "varying vec3 slideshowPosition;\n" + shader.vertexShader.replace(
            project, project + "\nslideshowPosition = mvPosition.xyz;"
          );
          shader.fragmentShader = "varying vec3 slideshowPosition;\n" + shader.fragmentShader;
          shading = "0.56 + 0.44 * abs(dot(normalize(cross(dFdx(slideshowPosition), dFdy(slideshowPosition))), normalize(vec3(-0.4, 0.65, 1.0))))";
        }
        shader.fragmentShader = shader.fragmentShader.replace(output, `
          if (slideshowWhite > 0.0) {
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${shading}), slideshowWhite);
          }
          ${output}
        `);
      };
      material.needsUpdate = true;
    }
  }

  return (value) => {
    if (blend.value === value) return;
    prepare();
    blend.value = value;
    redraw?.();
  };
}
