/**
 * The author's own FBX models, loaded as they are from `public/`, not rebuilt.
 *
 *   public/Ledger_Nano_X.fbx   9 meshes, 150k triangles, 5.4 MB
 *   public/Ledger_Stax.fbx     1273 meshes, 399k triangles, 39.0 MB
 *
 * Both export in millimetres with the device's length along +Y and its screen facing +Z, which is the frame the
 * scene already expects, so the only normalisation needed is: hide the parts the brief excludes, recentre on the
 * body, and scale millimetres to world units.
 *
 * Materials are re-assigned, not kept: the exports carry render-engine materials ("RS Material_0") with no
 * relation to this scene's light. Everything but the screen gets the blackened brushed steel already defined for
 * the devices; the screen face gets the emissive OLED / matte E Ink material so the narrative word renders on it.
 *
 * The Stax is loaded lazily, at the first stop rather than at page load: 39 MB is far past any hero budget and
 * it is not on screen until the morph. Its 1273 meshes are merged by material, which changes no geometry, only
 * the number of draw calls.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useLoader } from '@react-three/fiber'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { DeviceMaterials } from './devices'
import type { SceneColors } from './tokens'
import { NANO, FLEX } from './devices'

export const NANO_FBX = '/Ledger_Nano_X.fbx'
export const STAX_FBX = '/Ledger_Stax.fbx'

/** Millimetres to world units: the real Nano X is 72 mm long and the scene draws it 2.2 units long. */
export const MM = 2.2 / 72

/**
 * Parts of the Nano X export that are not drawn.
 *   01_SWIVEL    the steel sleeve: the brief keeps the key alone.
 *   MOTHERBOARD  internals, sealed inside an opaque shell and worth 40k triangles on their own.
 *   BATTERY      same.
 */
const NANO_EXCLUDED = new Set(['01_SWIVEL', 'MOTHERBOARD', 'BATTERY'])
/** The screen panel, and the front face it sits under: that face has to be glass or it hides the screen. */
const NANO_SCREEN = '04_SCREEN'
const NANO_GLASS = 'Top_Cover'

/** Blackened brushed steel: anisotropic highlight running along the device's length. */
function steel(colors: SceneColors): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: colors.body,
    metalness: 0.62,
    roughness: 0.48,
    transparent: true,
  })
  m.anisotropy = 0.7
  m.anisotropyRotation = Math.PI / 2
  return m
}

/**
 * The light glass front, as on the real device. `depthWrite` is off: a transparent material still writes depth by
 * default in three, and the front face is drawn before the panel underneath it, so leaving it on hides the screen.
 *
 * It is drawn BEFORE the lit panel, and that ordering is the whole reason the screen can reach white. This
 * sheet is `device-screen-off` at 26%, so compositing it over the panel multiplied the panel by ~0.74: the
 * emissive saturated its own write at 1.0 and then lost a quarter of it to the glass, which is why the
 * brightest pixel measured 223 at an emissive of 1.61 and 223 again at 2.60. Raising the lift could not move
 * a number that was being set after the lift had already clipped. Drawn underneath, the glass still tints the
 * whole top cover as before and no longer stands between the word and the camera.
 */
function glass(colors: SceneColors): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: colors.screenOff,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  })
}

type Built = { object: THREE.Object3D; materials: DeviceMaterials; dispose: () => void }

/**
 * Re-projects a panel's UVs so a screen texture lands on it square.
 *
 * The export's own UVs are authored for its render engine and do not map the panel corner to corner, so the word
 * would land anywhere. `long` and `short` are the local axes of the panel: the word reads along `long`, which is
 * the device's length, because that is how the screen is oriented on the real hardware.
 */
function projectPanelUv(geometry: THREE.BufferGeometry, long: 'x' | 'y' | 'z', short: 'x' | 'y' | 'z'): void {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  const spanLong = box.max[long] - box.min[long] || 1
  const spanShort = box.max[short] - box.min[short] || 1
  for (let i = 0; i < pos.count; i++) {
    const l = (pos[`get${long.toUpperCase()}` as 'getX'](i) - box.min[long]) / spanLong
    const sv = (pos[`get${short.toUpperCase()}` as 'getX'](i) - box.min[short]) / spanShort
    uv[i * 2] = l
    uv[i * 2 + 1] = sv
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/**
 * Recentres on the VISIBLE geometry and scales it so the device is exactly as long as the scene expects.
 *
 * Both are measured rather than assumed: `Box3.setFromObject` walks hidden children too, so the excluded sleeve
 * would otherwise drag the centre and the height with it, and deriving the scale from the measured length makes
 * the result independent of whatever unit the export was saved in.
 */
function normaliseVisible(root: THREE.Object3D, targetLength: number): { scale: number; measuredLength: number } {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const meshBox = new THREE.Box3()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    meshBox.setFromObject(m)
    box.union(meshBox)
  })
  if (box.isEmpty()) return { scale: 1, measuredLength: 0 }
  const size = new THREE.Vector3()
  const centre = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(centre)
  root.position.sub(centre)
  const scale = targetLength / size.y
  return { scale, measuredLength: size.y }
}

function buildNano(source: THREE.Group, colors: SceneColors, oledTexture: THREE.Texture): Built {
  const root = source.clone(true)
  const body = steel(colors)
  const sheet = glass(colors)
  const screen = new THREE.MeshStandardMaterial({
    color: colors.screenOff,
    emissive: colors.screenOn,
    emissiveMap: oledTexture,
    emissiveIntensity: 0,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
  })
  const all: DeviceMaterials['all'] = [
    { material: body, opacity: 1 },
    { material: sheet, opacity: 0.26 },
    { material: screen, opacity: 1 },
  ]
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (NANO_EXCLUDED.has(m.name)) {
      m.visible = false
      return
    }
    m.castShadow = true
    m.receiveShadow = false
    if (m.name === NANO_SCREEN) {
      // The panel lies in its own XZ plane: X is the device's length, so the word reads along it.
      m.geometry = (m.geometry as THREE.BufferGeometry).clone()
      projectPanelUv(m.geometry as THREE.BufferGeometry, 'x', 'z')
      m.material = screen
      // Above the glass: an emissive display is not something the cover sheet should be multiplying down.
      m.renderOrder = 2
      m.castShadow = false
      return
    }
    if (m.name === NANO_GLASS) {
      m.material = sheet
      m.renderOrder = 1
      m.castShadow = false
      return
    }
    m.material = body
  })
  return {
    object: root,
    materials: { all, screen },
    dispose: () => {
      body.dispose()
      sheet.dispose()
      screen.dispose()
    },
  }
}

/**
 * The Stax, merged by material. 1273 meshes would be 1273 draw calls; merging leaves a handful and touches no
 * vertex. The front face carries the E Ink material so the landed device can show the project name.
 */
function buildStax(source: THREE.Group, colors: SceneColors, labelTexture: THREE.Texture): Built {
  const root = new THREE.Group()
  const body = steel(colors)
  /*
   * The mark, and nothing under it.
   *
   * Two backgrounds have now been taken off this face. First a sheet of E Ink paper, grain and all; then the
   * flat `device-screen-off` plate that replaced it, which is what the author saw as a grey layer sitting
   * behind the wordmark. Neither belonged: the model's own shell already reads as the device, and a plate laid
   * over it is a second surface pretending to be a screen.
   *
   * So the wordmark is the only thing added to this face. Its texture is transparent everywhere but the ink,
   * so between and around the letters the Flex's own surface shows through, shaded by the scene's light like
   * every other part of the device. The ink is carried on the EMISSIVE channel rather than the base colour:
   * the device is unlit by the time it settles, and lit only by the scene the mark would read as whatever grey
   * the ambient happens to give it rather than as the site's white.
   */
  const label = new THREE.MeshStandardMaterial({
    color: colors.screenOff,
    map: labelTexture,
    emissive: colors.onPrimary,
    emissiveMap: labelTexture,
    emissiveIntensity: 0.9,
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    opacity: 0,
  })
  const geoms: THREE.BufferGeometry[] = []
  source.updateMatrixWorld(true)
  source.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = (m.geometry as THREE.BufferGeometry).clone()
    g.applyMatrix4(m.matrixWorld)
    // Merging needs one shared attribute set; the export mixes UV channels and colours.
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.attributes.position.count * 2) | 0), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    geoms.push(g)
  })
  const merged = mergeGeometries(geoms, false)
  geoms.forEach((g) => g.dispose())
  const mesh = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), body)
  mesh.castShadow = true
  root.add(mesh)

  /*
   * Where the mark goes. The export carries its screen as part of the same 1273-mesh shell, with no material
   * that says which face it is, so the plane is measured off the merged shell's own bounding box and covers the
   * share of it the real device's screen covers. Nothing of the model's geometry is replaced or hidden.
   */
  const shell = new THREE.Box3().setFromObject(mesh)
  const shellSize = new THREE.Vector3()
  const shellCentre = new THREE.Vector3()
  shell.getSize(shellSize)
  shell.getCenter(shellCentre)
  const SCREEN_SHARE_W = 0.9
  const SCREEN_SHARE_H = 0.88
  const panel = new THREE.PlaneGeometry(shellSize.x * SCREEN_SHARE_W, shellSize.y * SCREEN_SHARE_H)
  const labelMesh = new THREE.Mesh(panel, label)
  // A hair proud of the front face, so it never fights the shell for depth. Nothing sits between the two.
  labelMesh.position.set(shellCentre.x, shellCentre.y, shell.max.z + shellSize.z * 0.006)
  labelMesh.renderOrder = 2
  root.add(labelMesh)
  return {
    object: root,
    /*
     * `screen` is what the scene's reveal drives, and it is the MARK, not the panel. The black panel comes in
     * with the device like every other surface; the wordmark waits for the screen to come on.
     */
    materials: { all: [{ material: body, opacity: 1 }, { material: label, opacity: 1 }], screen: label },
    dispose: () => {
      merged?.dispose()
      panel.dispose()
      body.dispose()
      label.dispose()
    },
  }
}

export function NanoXModel({ colors, oledTexture, onMaterials }: { colors: SceneColors; oledTexture: THREE.Texture; onMaterials: (m: DeviceMaterials) => void }) {
  const source = useLoader(FBXLoader, NANO_FBX)
  const built = useMemo(() => {
    const b = buildNano(source as THREE.Group, colors, oledTexture)
    const n = normaliseVisible(b.object, NANO.h)
    if (import.meta.env.DEV) console.info('[fbx] Nano X: visible length', n.measuredLength.toFixed(1), 'mm → scale', n.scale.toFixed(5))
    return { ...b, scale: n.scale }
  }, [source, colors, oledTexture])
  useEffect(() => {
    onMaterials(built.materials)
    return built.dispose
  }, [built, onMaterials])
  return (
    <group scale={built.scale}>
      <primitive object={built.object} />
    </group>
  )
}

export function StaxModel({ colors, labelTexture, onMaterials }: { colors: SceneColors; labelTexture: THREE.Texture; onMaterials: (m: DeviceMaterials) => void }) {
  const source = useLoader(FBXLoader, STAX_FBX)
  const built = useMemo(() => {
    const b = buildStax(source as THREE.Group, colors, labelTexture)
    const n = normaliseVisible(b.object, FLEX.h)
    if (import.meta.env.DEV) console.info('[fbx] Stax: visible length', n.measuredLength.toFixed(1), 'mm → scale', n.scale.toFixed(5))
    return { ...b, scale: n.scale }
  }, [source, colors, labelTexture])
  useEffect(() => {
    onMaterials(built.materials)
    return built.dispose
  }, [built, onMaterials])
  return (
    <group scale={built.scale}>
      <primitive object={built.object} />
    </group>
  )
}
