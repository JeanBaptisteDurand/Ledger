/**
 * Dev-only probe: loads the author's FBX files and dumps what is actually inside them (hierarchy, mesh names,
 * triangle counts, bounding boxes, materials), so the scene can be wired to the real geometry instead of guesses.
 * `?fbx=1` runs it and puts the result on window.__fbx. Never imported by the production build.
 */
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

export const FBX_PATHS = ['/Ledger_Nano_X.fbx', '/Ledger_Stax.fbx'] as const

type MeshInfo = { name: string; tris: number; size: [number, number, number]; center: [number, number, number]; material: string | string[] }
type ModelInfo = { path: string; ok: boolean; error?: string; ms?: number; meshes?: MeshInfo[]; totalTris?: number; bbox?: { size: [number, number, number]; min: [number, number, number]; max: [number, number, number] } }

const r3 = (v: THREE.Vector3): [number, number, number] => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]

export async function probeFbx(): Promise<ModelInfo[]> {
  const loader = new FBXLoader()
  const out: ModelInfo[] = []
  for (const path of FBX_PATHS) {
    const t0 = performance.now()
    try {
      const group = await loader.loadAsync(path)
      const meshes: MeshInfo[] = []
      let totalTris = 0
      group.updateMatrixWorld(true)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const g = m.geometry as THREE.BufferGeometry
        // World space: local geometry frames differ per mesh in this export, so only world boxes are comparable.
        const box = new THREE.Box3().setFromObject(m)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3
        totalTris += tris
        meshes.push({
          name: m.name,
          tris: Math.round(tris),
          size: r3(size),
          center: r3(center),
          material: Array.isArray(m.material) ? m.material.map((x) => x.name) : (m.material as THREE.Material).name,
        })
      })
      const whole = new THREE.Box3().setFromObject(group)
      const wsize = new THREE.Vector3()
      whole.getSize(wsize)
      out.push({
        path,
        ok: true,
        ms: Math.round(performance.now() - t0),
        totalTris: Math.round(totalTris),
        bbox: { size: r3(wsize), min: r3(whole.min), max: r3(whole.max) },
        meshes: meshes.sort((a, b) => b.tris - a.tris),
      })
    } catch (e) {
      out.push({ path, ok: false, error: String(e).slice(0, 300) })
    }
  }
  return out
}
