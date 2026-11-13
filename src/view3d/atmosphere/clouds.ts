import * as THREE from 'three'

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragment = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uDensity;
  uniform float uCover;
  uniform vec3 uColor;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 2.4);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    if (dir.y < 0.02) discard;
    vec3 p = dir * 2.6 + vec3(uTime * 0.012, 0.0, uTime * 0.008);
    float n = fbm(p);
    float clouds = smoothstep(uCover, uCover + 0.22, n);
    float alpha = clouds * uDensity * smoothstep(0.0, 0.22, dir.y);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`

export interface CloudDome {
  mesh: THREE.Mesh
  set(density: number, cover: number, color: string): void
  drift(elapsed: number): void
  dispose(): void
}

export function createClouds(): CloudDome {
  const uniforms = {
    uTime: { value: 0 },
    uDensity: { value: 0.35 },
    uCover: { value: 0.55 },
    uColor: { value: new THREE.Color('#f4f6f8') },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 24), material)
  mesh.name = 'clouds'
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return {
    mesh,
    set(density, cover, color) {
      uniforms.uDensity.value = density
      uniforms.uCover.value = cover
      uniforms.uColor.value.set(color)
    },
    drift(elapsed) {
      uniforms.uTime.value = elapsed
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
