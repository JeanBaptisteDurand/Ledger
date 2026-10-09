/**
 * The two devices' real-world dimensions, and the shape of the material handle the scene drives them through.
 *
 * This file used to BUILD both devices out of primitives — a Nano X and a Flex assembled from rounded boxes,
 * planes, glass sheets and a pulsing chevron. They were replaced by the FBX models (src/scene/fbx-devices.tsx)
 * and the components survived unused for several passes. Only the numbers and the types outlived them, which
 * is all HeroScene ever imported.
 *
 * Scale: 1 world unit = 32.7 mm (the Nano X body is 2.2 units tall). Proportions from the official spec
 * sheets (shop.ledger.com).
 */
import type * as THREE from 'three'

const MM = 2.2 / 72

/** Nano X — 72 x 18.6 x 11.7 mm, key only, steel cover omitted. */
export const NANO = { w: 18.6 * MM, h: 72 * MM, d: 11.7 * MM }
/** Flex — 78.4 x 56.5 x 7.7 mm, portrait. */
export const FLEX = { w: 56.5 * MM, h: 78.4 * MM, d: 7.7 * MM }

export type FadedMaterial = { material: THREE.Material; opacity: number }

export type DeviceMaterials = {
  /** Every material of the group with its resting opacity: multiplied per frame for the cross-fade. */
  all: FadedMaterial[]
  /** Emissive OLED (Nano X) or the wordmark layer (Flex): intensity / opacity driven per frame. */
  screen: THREE.MeshStandardMaterial
  /** Nano X only: the pulsing chevron. */
  chevron?: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; restY: number }
}
