import * as THREE from 'three';

/** Shared clock for shader animation (water shimmer, tree sway, bird wings). Advanced once per frame. */
export const timeUniform = { value: 0 };

export const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
export const flameMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
export const foundationMaterial = new THREE.MeshLambertMaterial({ color: '#8a857c', flatShading: true });

/** Foliage that bends in the wind. Bends from a planted base (quadratic in height). */
export function createSwayMaterial(strength: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float sw = sin(uTime * 1.4 + instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7);
          float hh = max(position.y, 0.0);
          transformed.x += sw * ${strength.toFixed(3)} * hh * hh;
          transformed.z += cos(uTime * 1.1 + instanceMatrix[3].z * 1.3) * ${(strength * 0.6).toFixed(3)} * hh * hh;
        #endif`,
      );
  };
  m.customProgramCacheKey = () => `sway-${strength}`;
  return m;
}

/** Translucent water with drifting ripples and sparkles, driven by world position. */
export function createWaterMaterial(color: string, opacity: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying float vUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvUp = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\nvarying float vUp;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float w = sin(vWPos.x * 1.9 + uTime * 1.1) + sin(vWPos.z * 2.3 - uTime * 0.9)
                + sin((vWPos.x + vWPos.z) * 1.3 + uTime * 0.7) + 0.6 * sin((vWPos.x - vWPos.z) * 3.1 - uTime * 1.6);
        diffuseColor.rgb += (w * 0.012 + smoothstep(2.2, 3.1, w) * 0.18) * step(0.5, vUp);
        diffuseColor.a = mix(min(1.0, diffuseColor.a + 0.2), diffuseColor.a, step(0.5, vUp));`,
      );
  };
  m.customProgramCacheKey = () => 'water-shimmer';
  return m;
}

export const seaMaterial = createWaterMaterial('#3f8db0', 0.72);
export const riverMaterial = createWaterMaterial('#5aa6c4', 0.82);
export const treeSway = createSwayMaterial(0.045);
export const bushSway = createSwayMaterial(0.02);
