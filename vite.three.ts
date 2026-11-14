/**
 * Every `import … from 'three'` (ours and the addons') resolves to the WebGPU build, so the
 * core classes, the node materials and WebGPURenderer come from one module graph. The regex is
 * exact: `three/addons/…`, `three/tsl` and `three/examples/…` keep their own paths.
 */
export const threeAlias = [{ find: /^three$/, replacement: 'three/webgpu' }]
