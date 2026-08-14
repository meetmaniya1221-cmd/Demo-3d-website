/**
 * Progressive surface enhancement: photographic texture maps shipped in
 * /public/textures are streamed in after boot and swapped over the procedural
 * surfaces. Planet, Sun and ring maps are real mission imagery from Solar
 * System Scope (CC BY 4.0, based on NASA data). If any file fails to load,
 * the procedural painter's texture simply stays - nothing breaks offline.
 *
 * Earth and the Moon are not here: they are approached closely enough to need
 * a whole layer stack and several resolutions each, so they stream themselves
 * from NASA products by distance (scene/earth.ts, scene/moon.ts).
 */
import * as THREE from 'three';
import type { SolarSystem } from './system';

const BODY_IDS = [
  'sun',
  'mercury',
  'venus',
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
        } else {
          const planet = system.planets.get(id);
          if (!planet) return;
          planet.setSurfaceMap(tex);
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
