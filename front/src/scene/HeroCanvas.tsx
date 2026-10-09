import * as THREE from 'three'
import { Canvas, type RootState } from '@react-three/fiber'
import { HeroScene } from './HeroScene'
import type { NotesState } from '../motion/context-note'
import type { HeroProgress } from '../motion/hero'
import type { Dawn } from '../motion/dawn'

export type CanvasControls = {
  invalidate: () => void
  /** 'always' while the hero is pinned in view, 'demand' otherwise. */
  setFrameloop: (mode: 'always' | 'demand') => void
}

type Props = {
  progress: HeroProgress
  dawn: Dawn
  title: string
  projectName: string
  notes: NotesState
  showBlackHole: boolean
  onReady: (controls: CanvasControls) => void
  onFirstRender: () => void
}

export function HeroCanvas({ progress, dawn, title, projectName, notes, showBlackHole, onReady, onFirstRender }: Props) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="always"
      // PCF (not "soft") so shadow.radius can follow the levitation height.
      shadows={{ type: THREE.PCFShadowMap }}
      // No canvas MSAA: the scene is rendered into a multisampled target (HeatPost), the canvas only receives a quad.
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 35, near: 0.1, far: 200, position: [0, 0.9, 7] }}
      onCreated={(state: RootState) => {
        state.gl.setClearAlpha(0)
        onReady({ invalidate: state.invalidate, setFrameloop: (mode) => state.setFrameloop(mode) })
      }}
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <HeroScene progress={progress} dawn={dawn} title={title} projectName={projectName} notes={notes} showBlackHole={showBlackHole} onFirstRender={onFirstRender} />
    </Canvas>
  )
}
