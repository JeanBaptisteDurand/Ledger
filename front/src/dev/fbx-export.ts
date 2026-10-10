/**
 * Dev-only: turns the author's Stax FBX into the one merged mesh the scene actually draws, and exports it as a
 * binary glTF. `?export=stax` runs it and puts the GLB, base64, on window.__glb; a script saves it to public/
 * and compresses it (`npx @gltf-transform/cli draco public/Ledger_Stax.glb public/Ledger_Stax.glb --method
 * edgebreaker`). The FBX lives in models-src/ and must be copied to public/ for the run. Never imported by
 * the production build.
 *
 * Why: Cloudflare Pages refuses any file over 25 MB and the FBX is 39 MB. The merged geometry is what
 * fbx-devices.tsx builds at runtime anyway (position, normal, uv, world matrices applied), so exporting it
 * loses nothing the scene used, and spares the browser a 1273-mesh merge on every load.
 */
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export async function exportStax(path = '/Ledger_Stax.fbx'): Promise<string> {
  const source = await new FBXLoader().loadAsync(path)
  const geoms: THREE.BufferGeometry[] = []
  source.updateMatrixWorld(true)
  source.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = (m.geometry as THREE.BufferGeometry).clone()
    g.applyMatrix4(m.matrixWorld)
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.attributes.position.count * 2) | 0), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    geoms.push(g)
  })
  const merged = mergeGeometries(geoms, false)
  if (!merged) throw new Error('nothing to merge')
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ name: 'shell' }))
  mesh.name = 'Ledger_Stax_shell'
  const root = new THREE.Group()
  root.name = 'Ledger_Stax'
  root.add(mesh)
  const buffer = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer
  const bytes = new Uint8Array(buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  return btoa(s)
}
