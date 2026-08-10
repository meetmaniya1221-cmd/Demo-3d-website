/**
 * Progressive surface enhancement: photographic texture maps shipped in
 * /public/textures are streamed in after boot and swapped over the procedural
 * surfaces. Planet, Sun, Moon and ring maps are real mission imagery from
 * Solar System Scope (CC BY 4.0, based on NASA data); Earth's map is
 * AI-generated with Higgsfield. If any file fails to load, the procedural
 * painter's texture simply stays - nothing breaks offline.
 */
import * as THREE from 'three';
import type { SolarSystem } from './system';

const BODY_IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

function textureUrl(id: string): string {
  return `${import.meta.env.BASE_URL}textures/${id}.webp`;
}

function prepare(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Derive a roughness map from the photographic Earth: blue-dominant pixels
 * (ocean) become smooth so the sun glint stays on the water.
 */
function earthRoughness(image: TexImageSource & { width: number; height: number }): THREE.Texture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const ocean = b > 60 && b > r * 1.15 && b > g * 1.05;
    const v = ocean ? 108 : 235; // rough ≈ 0.42 water, 0.92 land
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Kick off the texture streaming; applies each map as soon as it arrives. */
export function enhanceSurfaces(system: SolarSystem): void {
  const loader = new THREE.TextureLoader();
  for (const id of BODY_IDS) {
    loader.load(
      textureUrl(id),
      (tex) => {
        prepare(tex);
        if (id === 'sun') {
          system.sun.setSurfaceMap(tex);
        } else if (id === 'moon') {
          system.planets.get('earth')?.setMoonTexture(tex);
        } else {
          const planet = system.planets.get(id);
          if (!planet) return;
          if (id === 'earth') planet.setSurfaceMap(tex, earthRoughness(tex.image));
          else planet.setSurfaceMap(tex);
        }
      },
      undefined,
      () => {
        // procedural surface stays - enhancement only
      },
    );
  }

  // Cassini's real ring strip (x axis = radius, alpha = transparency)
  loader.load(
    textureUrl('saturn_ring'),
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 8;
      system.planets.get('saturn')?.setRingMap(tex);
    },
    undefined,
    () => {},
  );
}
