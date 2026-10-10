/**
 * The reader's switch for the scene's sound, and the one thing on the page that says the browser wants a
 * touch before it will play: while the context is blocked the label asks for it. Mono, small, bottom-left,
 * the nav's own link style; gone on the home, which is silent.
 */
import { useEffect, useState } from 'react'
import type { Soundtrack } from '../motion/sound'

const LABEL = { on: 'Sound on', off: 'Sound off', blocked: 'Sound · tap to enable' } as const

export function SoundToggle({ sound }: { sound: Soundtrack }) {
  const [state, setState] = useState(sound.state())
  useEffect(() => sound.subscribe(() => setState(sound.state())), [sound])
  return (
    <button
      type="button"
      className="sound-toggle t-button-cap nav-link"
      aria-pressed={state === 'on'}
      aria-label={state === 'blocked' ? 'Enable sound' : state === 'on' ? 'Turn sound off' : 'Turn sound on'}
      onClick={() => (state === 'blocked' ? sound.arm() : sound.toggle())}
      data-sound={state}
    >
      <span className="sound-toggle__dot" aria-hidden />
      {LABEL[state]}
    </button>
  )
}
