# RIVALS — Asset Pipeline (spec §10)

Every model passes through `@gltf-transform/cli` before entering the game:
`gltf-transform optimize` with Draco + WebP compression, texture-size 1024.
Target: every loaded model < 10 MB, loads < 2 seconds on standard broadband.

## Pipeline (mandatory per spec §10.1)
```bash
npx @gltf-transform/cli inspect raw_model.glb
npx @gltf-transform/cli optimize raw_model.glb optimized.glb \
  --compress draco --texture-compress webp --texture-size 1024
npx @gltf-transform/cli inspect optimized.glb
```

Loading in Three.js:
```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);
const gltf = await loader.loadAsync('optimized.glb');
```

## Recommended starting kit (spec §10.2)
| Asset | Source | License | Use |
|-------|--------|---------|-----|
| Weapons (guns) | Kenney Blaster Kit / Quaternius Ultimate Guns Pack | CC0 | AssaultRifle, Sniper, Pistol GLBs |
| Weapons (melee) | Kenney / Quaternius | CC0 | Katana, Scythe, Fists |
| Characters | Quaternius Universal Base Characters | CC0 | Player models, arms viewmodel |
| Environment | Kenney modular kits | CC0 | Walls, floors, crates, barriers |
| Textures/HDRIs | Poly Haven | CC0 | Materials, environment lighting |

## AI generation (spec §10.3) — for custom/missing assets
Meshy, Tripo, Trellis 2, Hunyuan3D 2.1, Modly, three.ws — generate → decimate
to <10k polygons → gltf-transform → verify free-tier license before shipping.

## Notes
- Kenney/Quaternius/Poly Haven hosts are outside the sandbox allowlist, so
  GLB assets are NOT vendored in this repo. Placeholder procedural geometry
  is used in `src/MapSystem.js` until assets are obtained and optimized.
- All assets must be < 10 MB and load < 2 s (success criterion #12).
