---
name: monolith-ledger-design
version: 4
generated_by: design-generator/design → rewritten from the built hero, re-aimed at the real product, then given the descent and the home
date: 2026-09-26
sources:
  # The hero AS BUILT is the reference for FORM. Every token below was read out of these files.
  - src/styles/tokens.css            # colours, type families and scale, sky ramp, vignette, note hairlines
  - src/scene/HeroScene.tsx          # lighting rig, shadows, screen lift, note anchors, hotspot geometry
  - src/scene/fbx-devices.tsx        # brushed steel, screen glass, OLED and wordmark materials, render order
  - src/scene/HeatPost.tsx           # heat shimmer, the shader's copy of the sky ramp
  - src/scene/StarField.tsx          # star layers, gravitational lens
  - src/scene/textures.ts            # the 1-bit OLED panel, the MONOLITH wordmark
  - src/scene/tokens.ts              # SKY_STOPS: the ramp as the shader reads it
  - src/motion/hero-math.ts          # time budget, phases, easing
  - src/motion/screen-words.ts       # the word sequence and the three blink tables
  - src/motion/hero.ts               # the stop-and-go player
  - src/motion/context-note.ts       # note timings
  - src/components/ScreenNotes.tsx   # the four doors, the connector, the counters
  - src/motion/hero.ts               # DESCENT: the landed → descending → done path (v4)
  - src/scene/BlackHole.tsx          # centred / emerge: the home's framing of the hole (v4)
  - src/motion/landing.ts            # the three title treatments, the glass sheets' reveals, the sideways proof (v4)
  - src/components/home/             # HomeHero (the name and the thesis), HomePoster (no-canvas home) (v4)
content_sources:
  # UPDATE.md and FRONT_UPDATE.md are the reference for CONTENT. Both at the repository root.
  - UPDATE.md                        # the product, the proofs, every figure quoted in this file
  - FRONT_UPDATE.md                  # the screens, the server contract, the routes, the states
ancestry: references/awesome-design-md/design-md/spacex/DESIGN.md (plus mistral.ai for four sky hexes) — the library direction this hero grew out of and has now superseded.
taste_profile: applied
project: Net·Out — an agent cannot enter a position it cannot exit. The holder signs an agent's bounds once, on their Ledger (budget, tolerated exit loss, expiry); a contract enforces them on every position by measuring the exit within the transaction itself, and anything that overflows comes back to the device with the number. Two surfaces — a cinematic 3D landing, and a canvas-free app for reading and signing.

colors:
  # ─── Canvas ───
  canvas-night: "#000000"          # page canvas, hero space, footer
  canvas-night-soft: "#0a0705"     # sections that need a lift from pure black
  canvas-panel: "#14100c"          # cards, panels, tables — warm-tinted
  canvas-panel-raised: "#1c1712"   # nested surfaces, table header, device-screen frame
  hairline-on-dark: "#3a2e22"      # 1px borders
  hairline-strong: "#55432f"       # focused / active borders
  # ─── Text ───
  on-primary: "#ffffff"
  on-primary-mute: "#d6c2a4"       # secondary text
  ink-mute: "#94806a"              # captions, disabled
  ink: "#000000"                   # text on the rare light surface
  # ─── Martian sky ramp (four Mistral sunset hexes + rose, violet and night) ───
  sky-ember: "#cc3a05"             # Mistral primary-deep — deep red band above horizon
  sky-orange: "#fa520f"            # Mistral primary — the single accent of the system
  sky-amber: "#ff8105"             # Mistral sunshine-800 — horizon glow
  sky-peach: "#ffb83e"             # Mistral sunshine-500 — brightest horizon stop
  sky-rose: "#c9667a"              # dusty rose: the crossing between violet and red
  sky-violet: "#2f1b45"            # the band a real dusk puts between night blue and warm horizon
  sky-night: "#050308"             # one step warmer than pure black; also the background scrim
  # ─── Regolith ground ───
  regolith-deep: "#2e1c11"
  regolith: "#6b4529"
  regolith-light: "#a8784a"
  # ─── Accent (one, Radix-style discipline) ───
  accent-incandescent: "#ffca6e"   # the one announced figure
  # ─── Narrative ramp: every text colour comes from here and nowhere else ───
  # Sampled off the base scene, ordered by luminance: horizon glow → ochres → reds → roses → black.
  text-050: "#fff1d4"              # the horizon's brightest glow: body copy
  text-100: "#ffca6e"              # incandescent orange: announced figures, positive highlights
  text-200: "#ffb83e"              # = sky-peach: the resume cue
  text-300: "#ff8105"              # = sky-amber: a highlight carried by colour alone
  text-400: "#c9667a"              # = sky-rose: the variance note
  text-500: "#a8784a"              # = regolith-light: the negative highlight, dulled
  text-600: "#fa520f"              # = sky-orange
  text-700: "#cc3a05"              # = sky-ember
  text-800: "#6b4529"              # = regolith
  text-900: "#2e1c11"              # = regolith-deep
  text-950: "#000000"              # = canvas-night
  # ─── Page roles: the ramp is the chromatic system of the whole page, not only the hero ───
  page-surface: "{colors.text-950}"
  page-surface-lift: "#0a0705"
  page-panel: "#14100c"
  page-panel-raised: "#1c1712"
  page-hairline: "#3a2e22"
  page-hairline-strong: "#55432f"
  page-text: "{colors.text-050}"
  page-text-mute: "#d6c2a4"
  page-text-faint: "#94806a"
  page-accent: "{colors.text-300}"
  accent: "#fa520f"                # = sky-orange. Focus rings, connector hairlines, active tab, key stat
  accent-soft: "#ffb83e"           # hover / secondary emphasis on accent
  on-accent: "#000000"
  # ─── State ───
  # FRONT_UPDATE § 8 fixes three meanings the bench already uses; they map onto these tokens.
  state-success: "#7fb069"         # entered, bought, a bot running
  state-warning: "#ffb83e"         # gold: what asks the bearer — a mandate, an out of bounds request
  state-error: "#e0483a"           # refused by the contract, rejected on the device, wrong chain
  state-info: "#a0b4c8"            # the MCP key, the Signer Kit report, informational notices
  # ─── Ledger device ───
  device-body: "#0b0b0b"           # matte black slab
  device-edge: "#1f1f1f"           # bevel highlight
  device-screen-off: "#050505"
  device-screen-on: "#f5f0e8"      # OLED emissive
  device-eink: "#c9cac6"           # reserved; the E Ink sheet was removed from the scene
  device-ink: "#141414"
  device-alu: "#b8b8b4"
  # ─── Space ───
  space-deep: "#06101f"            # night sky: the complement of the dusk orange
  space-azure: "#2b7fb8"           # faint nebulosity
  space-azure-soft: "#8fc2e6"

typography:
  # BUILT — these tiers exist as classes in src/styles/tokens.css and are on screen today.
  display-monolith:
    fontFamily: "Barlow Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "clamp(88px, 11.5vw, 200px)"
    fontWeight: 700
    lineHeight: 0.88
    letterSpacing: "0.02em"
    textTransform: uppercase
    note: "The horizon title. Baked into a canvas texture on a 3D billboard, not an HTML layer."
  display-xxl:
    fontFamily: "Barlow Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: 80px
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: 1.6px
    textTransform: uppercase
  display-xl:
    fontFamily: "Barlow Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: 60px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 1.2px
    textTransform: uppercase
  display-lg:
    fontFamily: "Barlow Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0.96px
    textTransform: uppercase
  numeral-hero:
    fontFamily: "Barlow Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "clamp(96px, 12vw, 160px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariantNumeric: tabular-nums
  note:
    fontFamily: "Cabin, Barlow, Arial, sans-serif"
    fontSize: "clamp(17px, 1.32vw, 22px)"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0.005em"
    maxWidth: 46ch
    textWrap: pretty
    color: "{colors.text-050}"
    note: "The description tied to an object by a hairline. Its highlights are weight 500 in {colors.accent}."
  body-lg:
    fontFamily: "Barlow, Arial, Verdana, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0.2px
  body-md:
    fontFamily: "Barlow, Arial, Verdana, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.2px
  button-cap:
    fontFamily: "Barlow, Arial, Verdana, sans-serif"
    fontSize: 13px
    fontWeight: 700
    lineHeight: 0.94
    letterSpacing: 1.17px
    textTransform: uppercase
  micro-cap:
    fontFamily: "Barlow, Arial, Verdana, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 2.0
    letterSpacing: 0.96px
    textTransform: uppercase
  caption:
    fontFamily: "Barlow, Arial, Verdana, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  mono-device:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: 0.04em
    textTransform: uppercase
    fontVariantNumeric: tabular-nums
  device-wordmark:
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif"
    fontWeight: 600
    letterSpacing: "0.16em"
    textTransform: uppercase
    note: "What the DEVICE writes. Drawn into a 480x600 canvas texture with corner brackets; Inter stands in for Ledger's unlicensable brand faces."
  # The tiers the app needs (built in src/styles/app.css).
  body-sm:
    fontFamily: "Barlow, Arial, Verdana, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.2px
  mono-data:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
    fontVariantNumeric: tabular-nums
  mono-data-lg:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.01em
    fontVariantNumeric: tabular-nums

rounded:
  xs: 4px
  sm: 8px
  md: 16px
  pill: 32px
  device-nano: 14px      # Nano X slab corner
  device-flex: 22px      # Flex slab corner

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 18px
  xl: 24px
  xxl: 32px
  huge: 48px
  section: 96px

motion:
  # Every number below is in src/motion/. They are the site's timing vocabulary, not hero trivia.
  dawn: { duration: 3.2s, ease: power2.inOut }
  blink-on: { pulses: "[0–0.05] [0.13–0.17] [0.31–0.42]", steady: 0.52s }
  blink-off: { pulses: "[0–0.07] [0.12–0.16] [0.26–0.29]", dark: 0.4s }
  blink-acknowledge: { pulses: "[0–0.05] [0.11–0.17] [0.25–0.34]", steady: 0.44s }
  line-draw: { total: 0.55s, firstLeg: "0.62 · total, power2.inOut", secondLeg: "0.38 · total, power2.out" }
  note-text: { duration: 0.45s, ease: power2.out, delay: "0.8 · line-draw" }
  counter: { duration: 0.9s, ease: power3.out, delay: "0.8 · line-draw" }
  idle-offer: 4.5s
  hover-damp: 7
  active-damp: 9
  pointer: { tiltDeg: 11, shift: 0.17, damp: 6 }

sound:
  # LANDING ONLY. Two of the author's files in public/; the home and the app are silent. src/motion/sound.ts
  wind: { file: wind-desert.mp3, level: 0.32, in: "2.5 s with the dawn", out: "3.2 s over the launch", loop: true }
  music: { file: zarathustra.mp3, level: 0.85, start: "18.5 s, just before the first trumpet call, on the launch", play: "once, continuously, to the end of the file (107 s); the scroll never cuts or moves it", timing: "the scene is timed on the music by its own pace: the calls fall about the flights and the stops, the fortissimo at 65.5 s (47 s after the launch) arrives on the final vision at a reading pace", descent: "the music goes on and fades over 3.4 + 4.5 s, then stops; the home is silent after that" }
  gate: "the browser's: no sound before a click, a key or a touch (a wheel is not one). The context is tried at the dawn and on the first gesture; the toggle (components/SoundToggle.tsx, bottom-left of the scene) asks for that gesture and remembers the choice in localStorage 'monolith-sound'."
  rights: "Strauss (1896) is public domain; the RECORDING's rights are the author's to clear before the jury. The wind file is labelled no-copyright by its source."

background:
  # HOME ONLY (`/home`). The app has no canvas, so none of this applies there.
  descent: { seconds: 3.4, dollyFrom: 0.1, dollyTo: 0.64, black: 0.64, emergeFrom: 0.68 }   # src/motion/hero.ts DESCENT
  descentNote: "One scroll from the landed scene. The name blinks out on WORD_BLINK_OUT, the camera dollies into the Flex's screen, the frame is black at 0.64, the world is struck on that black frame, the hole grows out of the centre from 0.68 with the star field coming back under it. The page unlocks at the end and the path becomes /home."
  holeRadius: 0.34                   # of the short side, centred; the scene's arc framing is arcRadiusPx
  glass: { model: realglass, ior: 1.52, dome: "rim 0.42 of the half size, min 70px, power 1.8, soft corners 48px", disp: 30px, aberration: 0.5, highlight: "text-050 at 0.06, shininess 90, from the ring's centre", tint: 0, absorb: 0.5, frost: "eighth-res without the stars, 5-tap ×6", textShadow: "0 1px 1px canvas-night 55%, not on figures", hairline: "text-050 10%", focus: "accent-incandescent border 70% + 1px ring 45% + 32px sky-orange 18% while the sheet crosses the middle 36% of the viewport" }   # src/scene/glass.ts, tokens.css .glass[data-focus]
  emphasis: { takeaway: "mono 13px accent-incandescent + ember dot, first in every sheet", hotFragment: "one part of each title stays accent-incandescent, warmth 14px sky-orange 30%", hotValue: "mirrorHot / Stats tone hot", call: "btn-ghost--hot" }   # content.ts HotTitle, primitives Hot/Takeaway
  glassNote: "Drawn in the compositing pass, on the live ring. Clear: no tint, no hairline, no coloured light — the only opacity is the blur (the author, 2026-09-27). The surface is a pillow, not a plate with a bevel: the tilt rises as a power from deep inside on a soft-cornered field, so there is no inner edge and no facet. The frosted copy is the scene rendered without its star layer, so a star never becomes a grey block under the glass. Fallback without a canvas (posters): the CSS sheet, canvas-night 42% over blur(26px)."
  figures: { model: "glass of lava", spring: "k 42, c 7.5", ripples: "1-D damped wave, 48 samples, c 90, damping 2.2", swell: "0.6% at rest, 3% pouring", body: "warped noise + channel bleed (three.js webgl_shader_lava, MIT): sky-orange with veins of accent-incandescent, brighter toward the surface — the titles' ignition palette, nothing darker", meniscus: "text-050, 3px", halo: none }   # src/scene/liquid.ts — only the ink fills; nothing is drawn outside the number
  figuresNote: "Drawn in the compositing pass inside the glyphs of the DOM number (its text rendered to a canvas with its own font, uploaded as a mask). The level is the count through a damped spring, so it lags, overshoots and settles; a fast scroll raises ripples that travel and die. The DOM number keeps its place and its text and is transparent in WebGL mode. Fallback without a canvas (posters): the CSS liquid (mask + wave tile), full under reduced motion."
  frieze: { pxPerSecond: 26, playhead: 0.36, ticks: "1 s minor, 10 s labelled", link: "the seconds written on the axis over each span; the live card outlined, its stem lit; untimed steps dashed, no span" }   # components/landing/Frieze.tsx
  stars: 0.55                        # the field stays, dimmer: it is what the lens bends
  starField: { count: 4800, depth: "z 1 → 7, speed · size · light ∝ 1/z", driftNear: "44 px/s down", sizeNear: 4.4px, lens: "per star, closed-form thin lens, tangential stretch capped at 14, light ∝ 1/stretch, gone at the ring", scroll: "the scene's progress (2 600 px over the sequence) and 35 % of the home's scroll move every star over its depth; the speed streaks it", light: "hot core over white, halo, spikes on the near bright ones, twinkle on the near ones, white / text-050 / space-azure-soft" }   # src/scene/StarField.tsx (2026-09-29)
  hole: { core: "black disc, soft edge, 0.975 of the horizon", ring: "photon ring + prominences", corona: "exp falloff, faint drifting rays, cut at 2.4 radii on the home / 1.6 on the arc", diamond: "on the beamed side, text-050 core, 7 rays, flicker" }   # src/scene/BlackHole.tsx (2026-09-29), reference public/blackhole.avif
  pauseWhenHidden: true
  pauseNote: "On visibilitychange hidden → frameloop 'never'; the hole runs its own accumulated clock (BlackHole holeTime), so it resumes where it was instead of jumping by the hidden duration."
  dpr: "[1, 1.5]"                    # the same as the scene: the author kept the resolution behind the glass (2026-09-26)
  titles: ignition                   # the letters catch left to right, incandescent, and cool to cream; motion/landing.ts

components:
  button-ghost-on-dark:
    backgroundColor: transparent
    textColor: "{colors.on-primary}"
    borderColor: "{colors.on-primary}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.pill}"
    padding: 18px 24px
  button-sign-on-device:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.ink}"
    typography: "{typography.button-cap}"
    rounded: "{rounded.pill}"
    padding: 18px 24px
    note: "The ONLY filled button. It appears where the bearer is asked to read something on the Ledger and hold to sign."
  nav-bar-overlay:
    backgroundColor: transparent
    textColor: "{colors.on-primary}"
    typography: "{typography.button-cap}"
    padding: 24px 32px
    note: "Hidden while the sequence runs; fades in when the player releases the page."
  anchored-note:
    lineColor: "{colors.accent}"
    lineWidth: 1px
    tickSize: 5px
    tickRadius: 50%
    typography: "{typography.note}"
    note: "Right angles only, two legs drawn in sequence, a 5px dot at each end. The reusable way this site ties a sentence to a thing."
  card-panel:
    backgroundColor: "{colors.page-panel}"
    textColor: "{colors.page-text}"
    borderColor: "{colors.page-hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 24px
  mandate-card:
    backgroundColor: "{colors.page-panel}"
    borderColor: "{colors.page-hairline}"
    rounded: "{rounded.sm}"
    padding: 24px
    layout: "the proposed bounds as cards (budget, max round trip loss, expiry, slice, ticks, risk), then the line saying which three of them travel to the device, then one button-sign-on-device"
    note: "Replaces order-ticket. FRONT_UPDATE § 3.3. Only budget, exit loss and expiry go to the Ledger; the rest guides the bots without binding them, and the card must say so."
  journal-row:
    typography: "{typography.mono-data}"
    labelColor: "{colors.page-text-mute}"
    valueColor: "{colors.page-text}"
    rowBorder: "{colors.page-hairline}"
    padding: 12px 0
    leftRule: "2px, state-success when EXECUTED, state-error when refused, state-warning under an exception"
    note: "Replaces cost-breakdown-row. One decision per row: tick, bot, position, entry or displayed yield, exit or door, decision. FRONT_UPDATE § 3.4."
  signer-report:
    backgroundColor: "{colors.page-panel-raised}"
    textColor: "{colors.state-info}"
    typography: "{typography.mono-data}"
    rounded: "{rounded.xs}"
    padding: 8px 12px
    note: "Replaces attestation-fingerprint. Shows state.last_report from the Signer Kit, e.g. isBlindSign=false · eip7730. It is the proof the device read fields and not a blob."
  device-screen-mirror:
    backgroundColor: "{colors.device-screen-off}"
    textColor: "{colors.device-screen-on}"
    borderColor: "{colors.page-hairline-strong}"
    typography: "{typography.mono-device}"
    rounded: "{rounded.device-flex}"
    padding: 20px 24px
    note: "Shows EXACTLY the fields the device shows, in the device order. One field per line. Nothing decorative."
  data-table:
    headerBackground: "{colors.page-panel-raised}"
    headerTypography: "{typography.micro-cap}"
    headerColor: "{colors.page-text-faint}"
    bodyTypography: "{typography.mono-data}"
    rowBorder: "{colors.page-hairline}"
    cellPadding: 12px 16px
    numericAlign: right
  text-input:
    backgroundColor: "{colors.page-surface-lift}"
    textColor: "{colors.page-text}"
    borderColor: "{colors.page-hairline}"
    focusBorderColor: "{colors.accent}"
    typography: "{typography.mono-data-lg}"
    rounded: "{rounded.xs}"
    padding: 12px 16px
  badge-state:
    typography: "{typography.micro-cap}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
    variants: "success / warning / error / info → text in state color, 1px border same color at 40% alpha, no fill"
  footer-dark:
    backgroundColor: "{colors.canvas-night}"
    textColor: "{colors.page-text-mute}"
    typography: "{typography.caption}"
    padding: 32px 24px
  # ─── NEW in version 3. Each one is here because nothing above does its job. ───
  exit-pair:
    status: new
    surface: landing and app
    layout: "two figures on one baseline, the entry left and the exit right, separated by a 1px accent rule; the exit carries the weight"
    typography: "{typography.numeral-hero} for the exit, {typography.mono-data-lg} for the entry"
    note: "THE figure of this project: 0 bps to enter, 9 990 to leave. No existing component shows two opposed numbers as one statement."
  timeline-run:
    status: new
    surface: landing
    layout: "a vertical 1px page-hairline with a 5px accent dot per step; each step is a label, a duration and an outcome"
    typography: "{typography.mono-data} for durations, {typography.body-md} for labels"
    note: "The A to Z run as evidence. A data-table flattens a sequence into rows and loses the order."
  device-screen-live:
    status: new
    surface: app
    layout: "the emulator PNG from GET /api/screen at about 2 Hz, in the same frame as device-screen-mirror, plus the finger legend"
    note: "Distinct from device-screen-mirror, which is HTML text. This one is a live image and takes POST /api/finger clicks. FRONT_UPDATE § 3.8."
  escalation-card:
    status: new
    surface: app
    backgroundColor: "{colors.page-panel}"
    borderColor: "{colors.state-warning}"
    note: "Gold, per FRONT_UPDATE § 8: gold is what asks the bearer. Carries the bot, the question, seen_exit_bps against mandate_allows_bps, the queue count, and the TWO outcomes — read and sign, or leave refused. FRONT_UPDATE § 3.5."
  chat-thread:
    status: new
    surface: app
    layout: "alternating turns, a text-input at the foot, suggestions above it; under each answer a tool trace in micro-cap"
    note: "Used twice with different content: the strategist (§ 3.3) and the analyst (§ 3.7). The tool trace is what makes the analyst honest — it cites the tool under the number."
  bot-card:
    status: new
    surface: app
    layout: "name, universe, rhythm, then the counters as a row: rounds, bought, refused, exceptions, positions, spent"
    note: "FRONT_UPDATE § 3.4. Active and stopped share the shape; stopped adds the date range and the stop_reason."
  toast:
    status: new
    surface: app
    note: "Every POST answers {ok, msg}; an ok:false is a message to show, not an exception. FRONT_UPDATE § 2 and § 6.6."
  key-reveal:
    status: new
    surface: app
    typography: "{typography.mono-data}"
    note: "The MCP key masked by default, a reveal toggle, and a copy for the Claude config block. FRONT_UPDATE § 3.2."
---

## Visual Theme & Atmosphere

The discipline came from SpaceX: pure black canvas, white uppercase condensed display type, one full-bleed thing per band, one ghost pill, nothing else. This project kept the negation and swapped the medium — **the photograph became a real-time 3D scene**, and the rocket became a Ledger.

The concept is the opening of *2001: A Space Odyssey*. A black slab stands on ochre rock under a Martian dusk; three scrolls shake it loose and it launches; mid-flight it stops three times to say a word; it becomes a Ledger Flex and lands in front of a black hole. The Ledger is the monolith, and the metaphor is the subject itself: **a mass you cannot get out of**. The product is the way out.

Kubrick's austerity is the rule. Few elements, raking light, visual silence. No glow, no neon, no mesh gradient. Light in the scene comes from the horizon and, from the first stop onward, from the device's own screen. Everything under the hero is a calm, dense, legible product surface.

**Key Characteristics**
- One canvas: `{colors.canvas-night}` `#000000`. Panels lift to `{colors.page-panel}` — warm-tinted, never grey-blue.
- Display type uppercase, condensed, positively tracked. The horizon title is `{typography.display-monolith}` and sits **behind** the device, which occludes letters on purpose.
- A single accent, `{colors.accent}` `#fa520f`, used the way SpaceX uses white: focus rings, the connector hairlines, the active tab, one key figure.
- The sky ramp lives **only in the hero canvas** and its shader twin. It never becomes a UI gradient.
- Numbers and device fields are monospace, tabular. The mono face is the voice of the Ledger screen.
- No shadows, no glassmorphism. Depth is hairlines, the vignette inside the scene, and the 3D itself. One blur exists — the landing's background — and it never reaches a component.
- **Violet is in the sky now.** The original direction banned it; a real dusk puts a violet band between the night blue and the warm horizon, and without it the sky ran black-to-red in one hue and read as a single orange wash.

## Hero: the stop-and-go sequence

Not a pin and not a scrub. A player (`src/motion/hero.ts`) with five states — `armed-later · idle · running · waiting · done` — drives one `progress` ref from 0 to 1. Segments play at nominal speed; a stop waits for the reader. **The length of the hero is the reader's, not a scroll distance.**

| Beat | What happens | Timing |
|---|---|---|
| **Dawn** | Scroll locked. A radial mask centred on the horizon grows from nothing and the exposure follows it. | 3.2 s, `power2.inOut` |
| **Three scrolls** | The key is driven into the ground like a marker and resists. Two refusals shake it (`0.42`, then `1`), damped `exp(−5.6t)·sin(40t)` over 0.75 s. The third tears it free. | window 220 ms per intent |
| **Takeoff** | The key leaves the sand within 20 vh and the launch carries it to the camera axis, nothing on screen. | 5 s nominal |
| **Three stops** | `SPENDING` (roll, flat) → `THE EXIT` (yaw, standing 18°) → `THE RULE` (pitch, settling to 9°). Each segment is one whole turn about one axis, 1.9 s, device filling 0.72 of frame height. Between them the playhead never freezes: it creeps at 7.5 % of nominal so the sky keeps evolving. | deceleration 1.0 s, drift 1 s |
| **Finale, four beats** | Nano X morphs to Flex → the black hole descends behind her → its horizon catches from left to right → she lands, wordmark `MONOLITH`. | 1.2 · 1.5 · 1.2 · 1 s |

The word lights up **0.69 s before** the stop, so the key is still turning into its readable pose when the screen wakes. Order is strict: slow motion first, word second, pose last.

### The narrative, one word per stop

The arc is context, problem, response. Every figure below is quoted from `UPDATE.md` by section; **no other figure may be invented**. Highlights go on the values, highlighted fragments are non-breaking, and no content carries a dash.

| Stop | Word | Description | Figures |
|---|---|---|---|
| 1 | **`SPENDING`** | Agent Policies bound what an agent may **spend**. Ledger's own Earn returns the provider, the token, the yield and a deposit link, and **zero** fields on the way out. | § 1 and § 5 for the axis; § 3 and § 4 for the missing exit field |
| 2 | **`THE EXIT`** | Six real pools on Base charge **0 bps** to enter and **9 990** to leave. The same hook sets both, and the agent only ever sees the first. | § 4 for 6 pools, 0.00 bps, 9 990 bps and "the same hook"; § 8 D for Base |
| 3 | **`THE RULE`** | You sign your limits **once**, on the device. A contract measures the way out inside every transaction, and anything past your limit comes back to you **with the number**. | § 0, in full |

**The counter belongs to stop 2 and rolls `0 → 9 990`, unit `bps`.** It used to announce a date and a version number, which demonstrated nothing. The odometer now performs the argument: it starts at the entry price and stops at the exit price. This is the one animated figure on the landing.

**All three words are measured to render at the same size.** The panel fits each word independently from 26 px downward, so length decides size. `SPENDING` 92.2 px, `THE EXIT` 83.0 px, `THE RULE` 88.3 px, all of 112 px available, all at **26 px**. The previous set did not satisfy this: `OUR SOLUTION` fell to 21 px. Any replacement word must be measured before it is adopted.

Poster: below 768 px and under `prefers-reduced-motion`, a static image with the word sequence printed in order. No canvas, no player.

**The sequence ends; the scene does not.** When the player releases the page, everything is struck except the black hole, which stays as the background of the landing — see `## Depth & Elevation › Page background after the hero`.

## Page structure

Two surfaces, and the split is the reason the background can exist at all. The first surface has two paths: the scene is the **landing** and the sections are the **home**, and the descent is what joins them.

| | Landing | Home | Application |
|---|---|---|---|
| Route | `/` | `/home` | `/app/*` |
| Canvas | the scene, locked | the hole alone, fixed under the sections | **none** |
| three.js | ~255 kB gzip | same context, no second download | **never downloaded** |
| Served by | static build | static build (`/home` must rewrite to `index.html`) | **`web/server.py`, port 8099** |
| Read by | someone deciding whether to care | someone who wants the argument | someone who already decided |

**The descent** (`src/motion/hero.ts` `DESCENT`, `src/scene/HeroScene.tsx`): the landed scene stays locked. The next scroll is not the page, it is the descent — the name on the Flex blinks out on the device's own going-out pattern, the camera goes into the black screen until the screen is the frame, and on that black frame the world is struck and the hole grows out of the centre, whole, with the star field coming back under it. Then the name and the thesis (`HomeHero`), then the sections. The page unlocks at the end and the path becomes `/home` (`history.replaceState`, same document). A direct load of `/home` is the finished state. Without a canvas (phones, reduced motion) `/home` is `HomePoster`: a still of the hole, fixed under the same sheets.

**The schema stands on the home's surface** (2026-10-11, the author's call: "rework the schema page to the presentation standards of the /home page"). `/schema` mounts the scene in its finished state from the first frame (`Hero finished`, the path `jumpTo(1)` already took for a direct load of `/home`), writes its own name in the ring (`SCHEMA`), and lays its fourteen bands on glass sheets with the home's register: takeaway, ignited title with a hot fragment, lead, hairline lists, note, source. No pinned stage and no counter: data does not move there. Below 768 px and under reduced motion it is `HomePoster` under the same sheets. The app (`/app/*`, `/compte`, `/appareil`, `/connexion`) keeps no canvas.

**One codebase, one build, two origins.** The app cannot be a static deploy: the session cookie `pds_session` is HttpOnly, the emulator proxy `/speculos/*` must be **same origin**, and `dist/ledger-web.js` is served by the Python server (`FRONT_UPDATE` § 2). So the app's built assets are served by `web/server.py`, with a Vite dev proxy to 8099 during development. Only the landing may go to a static host.

**No link to the app opens a new tab.** `UPDATE.md` § 4 and `FRONT_UPDATE` § 6.2: a second client on the device during a signature refuses the pending command with `0x6901` and the app answers nothing else until it is restarted. A `target="_blank"` on the call to action is therefore a defect, not a preference.

### Landing, section by section

The order makes the thesis evident to a newcomer. It is not the order of `UPDATE.md`.

| # | Section | Role | Source | Figure | Components | Motif | Missing |
|---|---|---|---|---|---|---|---|
| 1 | **The scene** | The story in three stops on the device's own screen | § 0 § 1 § 4 § 5 | **0 → 9 990** bps | the scene, `anchored-note` | 1 · 2 · 3 · 4 | — |
| 2 | **The claim** | The angle, one full-width line | § 5 | — | `display-xxl` | 1 | — |
| 3 | **The trap, two instances** | The entry lies about the exit, on pools **and** on vaults | § 4 b1 and b3 | 6 pools · 0 / 9 990 · Moonwell **2 693** · previewRedeem 522.57 against maxWithdraw **381.82** · five vaults full | `data-table`, `badge-state` | 2 | `exit-pair` |
| 4 | **And the agent goes in anyway** | The yield agent takes Moonwell first, on displayed yield; Ledger's own Earn has no exit field | § 4 b4 and b8, § 3 | **zero** exit fields | `device-screen-mirror`, showing the `earn yields` output with the line that is not there | 3 | — |
| 5 | **One signature** | The mandate: budget, exit loss, expiry, read on the device | § 0, § 5 bis step 5, § 8 A | 0.5 WETH · **150** bps | `device-screen-mirror`, `button-sign-on-device` | 3 | — |
| 6 | **When it overflows** | The exception comes back to the device with the number, and may be refused | § 0, § 2, § 5 bis step 7 | **2 693** bps | `device-screen-mirror`, `badge-state` | 3 · 4 | — |
| 7 | **Measured, end to end** | The A to Z run as evidence rather than promise | § 4, the 25 Sept run | **124 s** · 2 bought / **8 refused** · analyst **35 s** | `data-table` | 2 | `timeline-run` |
| 8 | **What we found in their stack** | The depth, stated plainly | § 3, § 4 | `signMessage` **229 bytes pass, 272 fail** · chainId ≥ 256 · the blind sign report withheld · `0x6901` | `data-table`, `badge-state` | 2 | — |
| 9 | **Three bricks, three roles** | Signer approves, Agent Stack reads, Ring keeps a secret; the one that acts has no LLM | § 7 bis, § 8 B | 1.18.1 · 1.9.1 · 2.1.0 | `card-panel` ×3 | 4 | — |
| 10 | **The call** | "Your Ledger stays with you. We only hold a mandate." → `/app` | § 5 | — | `button-ghost-on-dark` | 1 | — |

### Application, screen by screen

A **persistent shell** carries the account header, `device-screen-live`, the `escalation-card` banner and the signing lock. It is imposed by `FRONT_UPDATE` § 6 rules 1, 2 and 5: an out of bounds request and a pending signature are account-wide, so they cannot live inside one panel. The panels change beneath it.

| Route | Role | Source | Figure | Components | Motif | States to draw |
|---|---|---|---|---|---|---|
| `/demo` | The system's map, live, revealed as the journey goes, with the NOW card and the Flex | README six rounds, APP.md run, captures/ | 1 WETH · 300 bps · 395 bps · 146 s | the stage (scenes, `device-frame`, mirror, journal, `escalation-card`, watch, trace), `LiveScreen` | 1 · 3 · 4 | playing · paused · stepped · bench offline · signed out · signed in |

**Cross-cutting states**, `FRONT_UPDATE` § 6.6, translated for the bearer rather than shown as codes: `0x6985` refused on the device · `0x6980` the app is stuck after an abandoned message, quit and reopen it · `0x6901` **another client is talking to the device**, close the other tabs.

**Vocabulary is fixed by the product, not by this file** (`FRONT_UPDATE` § 1): *mandate, bounds, vault, bot, round, slice, out-of-bounds request, exception, door, exit, re-probe, the holder*. The interface uses those words and no synonyms.

## Color Palette & Roles

### Canvas & Surfaces
- `{colors.canvas-night}` `#000000`: the page. Hero space, footer, everything between panels.
- `{colors.page-surface-lift}` `#0a0705`: bands that need a lift.
- `{colors.page-panel}` `#14100c`: cards, panels, tables. Warm-tinted so it never reads as slate.
- `{colors.page-panel-raised}` `#1c1712`: table headers, nested surfaces, the device-screen frame.
- `{colors.page-hairline}` `#3a2e22` / `{colors.page-hairline-strong}` `#55432f`: the only borders.

### Text
Every text colour comes from the narrative ramp and nowhere else. `{colors.text-050}` `#fff1d4` for copy, `{colors.page-text-mute}` `#d6c2a4` for labels, `{colors.page-text-faint}` `#94806a` for captions and table headers.

**`page-text-faint` may not sit on the landing's background.** Measured against the scrim it reaches 2.46:1, below AA. It needs a panel under it. `text-050` (8.3:1) and `page-text-mute` (5.4:1) are cleared.

### Sky ramp (hero canvas only)
Twelve stops, black at both ends, the dusk in the middle:

`night 0 · night 6 % · space-deep 24 · violet 38 · rose 50 · ember 56.5 · orange 60.8 · amber 64 · peach 66 · amber 69 · regolith-deep 76 · night 100`

Interpolated `in oklab`, with a plain sRGB fallback first so a browser without `color-mix()` still gets a sky. Three radial layers give it volume: the sun's bloom tight on the horizon, the warm scatter spreading out of it, and the dome deepening toward the top corners.

The ramp exists in three copies that must agree: the hero-height CSS gradient, the `--tall` scene variant (same stops, repositioned for a 200vh layer), and the shader's `SKY_STOPS`, which the heat-shimmer pass uses to redraw the sky it displaces. **The shader's array length is derived from the data**, so a stop added to the ramp cannot be silently dropped again.

### Accent
`{colors.accent}` `#fa520f` is the single chromatic accent, Radix-style: one hue, everything else neutral. Uses: focus ring (2px), the anchored-note hairlines and dots, the active tab underline, the one key figure per screen. Never on buttons, never on backgrounds, never as glow.

### State
The bench already fixed three meanings and the interface keeps them (`FRONT_UPDATE` § 8): **gold** is what asks the bearer, **green** is entered or active, **red** is refused. They map to `state-warning`, `state-success`, `state-error`. `state-info` carries the MCP key and the Signer Kit report. Always as text and 1px borders, never as filled backgrounds.

## Typography Rules

### Families — five, self-hosted from npm, nothing fetched off a font-sharing site
- **Barlow Condensed** 600/700 — every display tier, including the horizon title. Two other display faces were tried there and both were dropped; the condensed grotesk gives the tallest caps in the stack at a fixed line length, for no extra bytes and no licence question.
- **Barlow** 400/700 — body, buttons, eyebrows.
- **Cabin** 400/500 — the anchored note. Gill Sans is a Monotype commercial release in no libre catalogue; Cabin is an OFL humanist drawn after Johnston and Gill, so the proportions and open apertures the sentence needs are there.
- **JetBrains Mono** 400/500 — device fields and numbers. The mono is the Ledger's voice, so it is load-bearing.
- **Inter** 600 — what the *device* writes. Ledger's three brand faces cannot be redistributed; Inter is the face Ledger's own interface ships, it is SIL OFL, and it is the same family of shapes.

**Nothing is named in a stack that the project does not load.** A face the project does not ship only resolves on a machine that happens to already have it.

### Hierarchy

| Token | Size | Weight | LH | Tracking | Use | Built |
|---|---|---|---|---|---|---|
| `display-monolith` | clamp(88px, 11.5vw, 200px) | 700 | 0.88 | 0.02em | Horizon title, 3D billboard behind the device | ✓ |
| `display-xxl` | 80px (60/48/40 responsive) | 700 | 0.95 | 1.6px | Section opener under the hero | ✓ |
| `display-xl` | 60px | 700 | 1.2 | 1.2px | Sub-section | ✓ |
| `display-lg` | 48px | 700 | 1.25 | 0.96px | Panel title | ✓ |
| `numeral-hero` | clamp(96px, 12vw, 160px) | 600 | 1 | −0.01em | The exit figure in `exit-pair`; one key figure per screen | ✓ |
| `note` | clamp(17px, 1.32vw, 22px) Cabin | 400 | 1.55 | 0.005em | Anchored description, max 46ch | ✓ |
| `body-lg` | 18px | 400 | 1.7 | 0.2px | Pitch lead | ✓ |
| `body-md` | 16px | 400 | 1.5 | 0.2px | Default | ✓ |
| `button-cap` | 13px | 700 | 0.94 | 1.17px | Buttons, nav (uppercase) | ✓ |
| `micro-cap` | 12px | 400 | 2.0 | 0.96px | Eyebrows, table headers, tool traces (uppercase) | ✓ |
| `caption` | 13px | 400 | 1.5 | 0 | Helper, footer | ✓ |
| `mono-device` | 15px | 500 | 1.6 | 0.04em | Device-screen mirror lines | ✓ |
| `device-wordmark` | fitted to 74 % of the panel | 600 | — | 0.16em | MONOLITH on the Flex, Inter, corner brackets | ✓ |
| `body-sm` | 14px | 400 | 1.5 | 0.2px | Secondary | — |
| `mono-data` | 14px | 400 | 1.5 | 0 | Journal rows, table cells, addresses, keys | — |
| `mono-data-lg` | 22px | 500 | 1.2 | −0.01em | Inputs, the entry figure in `exit-pair` | — |

### Principles
- Display is always uppercase; the mono is uppercase only where the device is (`BUDGET`, `EXIT COST`, `EXPIRES`).
- Every number is `tabular-nums`, right-aligned in tables — including a counter mid-roll, so a rolling figure cannot shift its line sideways.
- Addresses are always shown as the server returns them, in checksum form, truncated in the middle only (`0xDad7…D8D`).
- Amounts come as wei strings: show WETH with 4 decimals above 0.001, wei below. Exit costs are bps, integers.
- The anchored note is the one place a humanist face appears; it carries `text-wrap: pretty` and a 46ch measure.
- No sixth family. No serif.

## Interaction grammar

Four motifs the hero established. **They are the site's vocabulary, not hero details** — every section of the landing and every screen of the app uses the same four, in HTML, without a canvas.

### 1. Blinking is how things arrive and leave

A device does not fade. It survives or it does not. Everything that appears, disappears or acknowledges on this site does it with short irregular pulses and then goes steady — never with an opacity ramp.

| Event | Pulses (s from due) | Steady / dark at |
|---|---|---|
| Something comes on | `[0–0.05] [0.13–0.17] [0.31–0.42]` | 0.52 |
| Something goes out | `[0–0.07] [0.12–0.16] [0.26–0.29]` | 0.40 |
| Something acknowledges you | `[0–0.05] [0.11–0.17] [0.25–0.34]` | 0.44 |

Three patterns, one shape: a long first survival, a short second, a longer third, then commitment. Reuse them as-is. Under `prefers-reduced-motion` the end state is shown directly.

### 2. The orange hairline ties a sentence to a thing

When a description belongs to an object, it is **attached** to it rather than placed near it. A 1px `{colors.accent}` line leaves the object, turns **one right angle**, and ends at the text. A 5px dot marks each end.

- **Right angles only.** No diagonals, no curves, no elbows with more than one turn.
- **Two legs, drawn in sequence**: the leg leaving the object first (0.62 of 0.55 s, `power2.inOut`), then the run toward the text (0.38, `power2.out`). The dots fade in staggered behind the first leg. The text arrives at 0.8 of the draw.
- **The anchor is a real edge of the object**, computed, not guessed: the lowest or highest crossing of its middle column, so the line never starts inside the shape whatever its pose. Mocked up floating in a gutter, it read as an ornament rather than an attachment.
- **Drawn with transforms** (`scaleY` then `scaleX`), so nothing ever leaves the compositor.
- Below 1280 px, where columns stack, the note degrades to an ordinary paragraph with a left accent rule and no hairline.

Off the hero this is how a figure is annotated, how a refusal explains itself, how a journal row says why.

### 3. The device screen carries the instruction

The Ledger's own screen is where the site tells the reader what to do. In the hero it reads `SCROLL UP` at rest, one word of narrative at each stop, and `SCROLL UP` again once a description has been read — and that return is what unblocks the next beat. The instruction lives on the object, not in the chrome.

The panel is one bit: 128×64, `NearestFilter`, thresholded to pure black and white, no antialiasing at any distance. Emphasis is brightness only — the word goes from a median 173 to **pure white 255** when it is the one being read. There is no underline, no bold, no halo: raising the emissive is the whole vocabulary, and it works because the glass front is drawn *under* the lit panel rather than over it.

In the app this is literal rather than metaphorical. `device-screen-mirror` shows exactly the fields the device shows, in the device order, one per line, nothing decorative:

```
Exit mandate
Network        Base
Agent          0x7099…79C8
Budget         0.5 WETH
Max round trip loss (bps)   150
Expires        2026-10-02 18:00 UTC
```

and, when it overflows:

```
Exit exception
Position       Moonwell Flagship ETH
Amount         0.05 WETH
EXIT COST (bps)             2693
Valid until    2026-09-25 19:12 UTC
```

`device-screen-live` sits beside it with the emulator's actual pixels. **The mirror is the promise, the live screen is the proof, and they must never disagree.**

### 4. Hover is what reveals content, and it is never the only door

Pointing at a thing brings its description. But the hover is one of **four doors onto the same state**, and they all do exactly the same thing:

| Door | Trigger |
|---|---|
| Pointer | `pointerenter` on the hotspot |
| Touch | `click` — the hotspot is a real `<button>` |
| Keyboard | `focus` alone reveals; no Enter needed |
| Patience | the description offers itself after 4.5 s of inaction |

The hotspot is a real `<button>`: hoverable, tappable, focusable and in the tab order for free. Its box tracks the object in screen space with a **44px floor** on both axes, so a small or distant object is still a legal target. It is invisible and inert until armed, and its focus ring is 2px `{colors.accent}` at 4px offset.

**The rule for the whole site: no content reachable by hover alone.** If a pointer can get it, so can a tap, a Tab key, and someone who simply waits.

## Component Stylings

**`button-ghost-on-dark`** — the universal CTA. Transparent, 1px white border, uppercase `button-cap`, 18×24 padding, pill. One per band.

**`button-sign-on-device`** — the single filled button in the system. White fill, black text. Label: "READ AND SIGN ON LEDGER". It appears exactly where the bearer must look at the device: the mandate, and each out of bounds request.

**`anchored-note`** — the hero's connector, generalised. 1px `{colors.accent}` line, one right angle, 5px dots at both ends, `{typography.note}` text, highlights at weight 500 in the accent. Three placements exist in the hero (under, top-left, right); pick the one whose run does not cross the object.

**`mandate-card`** — the proposed bounds, as cards. It must say plainly that **only budget, exit loss and expiry travel to the device**; the slice, the tick count and the risk profile guide the bots without binding them. Then one `button-sign-on-device`. After signature, `signer-report` underneath.

**`exit-pair`** — the entry and the exit on one baseline, separated by a 1px accent rule, the exit carrying `numeral-hero` and the entry `mono-data-lg`. It is the project's figure and it appears at most once per section.

**`escalation-card`** — gold border, because gold is what asks the bearer. The bot, the question in the bench's own words, `seen_exit_bps` against `mandate_allows_bps`, the queue count, and **both** outcomes with equal weight: read and sign, or leave refused. Leaving refused is not a cancel; it keeps the refusal, and no bot asks for that position again.

**`device-screen-mirror`** — the honest twin of the Ledger screen; examples in `## Interaction grammar › 3`.

**`data-table`** — header `page-panel-raised` with `micro-cap` labels; body `mono-data`; numeric right-aligned; state coloured as text only. No zebra, no hover fill; hover = 1px `page-hairline-strong` left border.

**`journal-row`** — one decision per row, with a 2px left rule in the state colour. Under the table, the reading: *N bought, M refused*, and the two sentences that explain the columns.

**`chat-thread`** — used by the strategist and by the analyst. Under every analyst answer, the tool trace in `micro-cap`: `MCP → operations() · vault_openness(vault=Moonwell) · decision(tick=1)`. The trace is not decoration; it is what makes the answer checkable.

**`bot-card`** · **`device-screen-live`** · **`key-reveal`** · **`toast`** · **`signer-report`** · **`badge-state`** · **`text-input`** · **`nav-bar-overlay`** · **`footer-dark`** — as in the frontmatter.

## Layout Principles

- Base unit 8px; tokens `xxs 4 · xs 8 · sm 12 · md 16 · lg 18 · xl 24 · xxl 32 · huge 48 · section 96`.
- Hero: full-viewport, no container, length set by the player rather than a scroll distance.
- Landing content: 1200px reading column. Sections separated by `section` 96px and a 1px hairline, never by a background change.
- App: the persistent shell holds the account header, the live device and the escalation banner; panels below it in the same 1200px column. Two-column at ≥ 1280px wherever a site field and a device field must sit on the same horizontal line — the mandate and each exception.
- One idea per panel.

## Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat `canvas-night` | Default |
| 1 | `page-panel` + 1px `page-hairline` | Cards, panels, tables |
| 2 | `page-panel-raised` | Table header, device frame, nested rows |
| 3 | The 3D scene | Landing only — depth is spatial, not CSS |

No box-shadow, no glow. The emissive device screen is the only "light" effect on the page and it lives inside the WebGL canvas.

**The blur is on the sheets.** Two rules preceded this one — "no backdrop blur", then "one page-level blur and none on a component" — and the author set both aside on 2026-09-26: the hole must be *perceived behind the components*, so each section stands on one **glass sheet** (`.glass`: `canvas-night` at 42 %, `backdrop-filter: blur(26px) saturate(1.25)`, a 9 % hairline, `rounded.lg`) and the bands under it are transparent. It is still not glassmorphism as a chrome: one sheet per section, never a blur inside a blur — a panel inside a sheet carries only its fill — and the sideways proof's cards are their own sheets because they leave the sheet. See **Page background after the hero** below.

**The vignette belongs to the scene and stops there.** An ellipse `76% × 70%` at centre, transparent to 42 % of the radius and reaching `rgb(0 0 0 / 0.82)` at the corners, **plus** a lateral gradient (`.52 → .18 → 0 … 0 → .18 → .52`) because a single ellipse on a frame much wider than it is tall leaves the left and right edges lighter than the corners. The centre is never darkened.

It was mocked up as a page-level layer and refused. Over the sections it darkens the white sign button until it reads as a gradient, which this direction forbids, and at 390 px its lateral falloff eats about 94 px of each edge — half the screen. Evidence kept in `design-shots/mockups/avec-vignette-1440.png` and `avec-vignette-390.png`. It is a cinematic frame, not a product surface.

### Page background after the hero

**Landing only.** The app has no canvas, so nothing in this section applies to `/app/*`.

Once the player releases the page, **the scene does not go away and it does not stay either.** Everything is struck except the black hole, which becomes the background of every landing section below, seen through a light blur and a slight glass deformation that keep the content readable.

| | Rule |
|---|---|
| **What is left** | The ring, whole and centred (radius 0.34 of the short side), its rim light, and the star field at 0.55 — kept because the lens bends it and a lens with nothing behind it is nothing. Ground, devices, title, sand and nebula are struck, in one group, on the black frame of the descent. |
| **One canvas, still** | The same WebGL context; its wrapper becomes `position: fixed` under the page (`#hero[data-mode='background'] .hero-canvas`). **Never a second context**, never a second scene. |
| **Where the glass lives** | In the compositing quad, one term per visible sheet (`src/scene/glass.ts`), from the emergence on. It is RealGlass' optical model — refraction through 1.52 with a thickness that grows toward the rim, Cauchy dispersion, a Blinn-Phong highlight from the ring's centre, frosting from a blurred copy — re-implemented, because RealGlass itself photographs the page once with html2canvas and cannot see a ring that moves every frame. Two departures from its look, both the author's: the surface is a **dome** (a soft-cornered field, the tilt rising as a power from 42 % of the half size), not a plate with a bevel and facets; and it is **clear** — no tint, no hairline, the highlight in the page's cream at 0.06 — so the blur is the only opacity. The frosted copy is the scene rendered at an eighth **without its star layer**. The sheets' rectangles are read off the DOM each frame. `backdrop-filter` remains only for the posters. |
| **The handover** | Invisible by construction: the world is struck on a frame that is already black (the Flex's screen is the frame), the canvas stands on `canvas-night`, and the stars come back with the ring's emergence rather than popping on the next frame. |
| **Legibility** | Each sheet is `canvas-night` at 42 % over a 26 px blur. The ring's line is the brightest thing behind it; blurred and dimmed it stays under sRGB 111, which is the floor the previous scrim arithmetic set for body text. **To re-measure on the final treatment**, and `page-text-faint` still may not sit on the background outside a sheet. |
| **Pause when hidden** | On `visibilitychange`, hidden → `frameloop: 'never'`. The hole accumulates its own clamped clock (`holeTime`), so it resumes where it was. Visible → `'always'` again, the fixed canvas being always in view on the home. |
| **Cost** | `frameloop` `'always'` for the whole home, at the scene's own `dpr [1, 1.5]` — the author kept the resolution rather than halving it behind the blur. The blur is per sheet and at most two sheets are on screen at once. |
| **Mobile < 768 px** | No WebGL. `HomePoster`: `public/poster-home-portrait.jpg`, a capture of the live home at 390 × 844 @2x, fixed under the same sheets. |
| **`prefers-reduced-motion`** | `HomePoster` with the landscape still; the title treatments render their end state. |

## Below the hero: what is inherited

Three principles, decided after mocking a section up rather than arguing about it (`design-shots/mockups/`). They govern the landing's sections **and** the app's screens.

### 1. The light comes down, the frame does not

The ramp is inherited as an **order of luminance**, never as a gradient. Surfaces from the regolith end (`#0a0705 → #14100c → #1c1712`), text from the horizon end (`#fff1d4 → #d6c2a4 → #94806a`), hairlines in between, one orange. **No section paints a gradient.** The sky ramp never leaves the canvas.

The vignette does not come down. The black hole does, on the landing only.

### 2. The motion comes down as vocabulary, not as means

**Zero continuous animation in the content.** On the landing the one animated background is the black hole, and it is the only moving thing. In the app nothing moves at all except state changing. What both inherit is the grammar — the blink on entry, the anchored hairline, the state treatments — in CSS steps, not GSAP timelines.

What does **not** come down: the 3D of the scene, the locked-scroll player, any scrub, the heat shimmer, the star field. Lenis stays on the landing (smooth scroll is not driven scroll) and is disabled below 768 px and throughout the app.

### 3. Data does not move, it explains itself

No animated figure in a table, no hover fill, no chart flourish. A counter rolls once, on a figure being announced, never in a row — and on this site there is exactly one: `0 → 9 990` at the second stop. But the hero's explanatory grammar is what dense data needs: **the one-turn hairline that ties a sentence to a number**, and **the four doors** that reach it. The `device-screen-mirror` is the literal continuation of "the object carries the instruction".

## Do's and Don'ts

### Do
- Keep a scene to four things: ground, sky, device, title. Then remove the ground.
- Render display uppercase in Barlow Condensed with positive tracking.
- Put the mirror beside the thing it mirrors, on the same baseline; every field the bearer signs has its line on the mirror.
- Use `accent` on at most one element per viewport, and use the anchored-note grammar whenever a sentence belongs to a thing.
- Blink things on and off. Never fade them.
- Keep the background one canvas, on the landing, and none in the app.
- Give every revealable thing four doors.
- Draw every state listed in `## Page structure`, including the three device error codes in words.
- Give "leave refused" the same weight as "sign": refusing is a decision, not a cancel.
- Honour `prefers-reduced-motion` and the 768px poster without exception.

### Don't
- No mesh gradient, no glow, no neon green. (Violet is allowed **in the sky only** — never in UI.)
- No blur inside a blur. A section stands on one glass sheet; a panel inside it carries only its fill. No glass in the app.
- No vignette outside the scene. No canvas in the app.
- No sky ramp on UI surfaces; it exists only inside the hero canvas and its shader twin.
- No filled buttons except `button-sign-on-device`.
- No animated numbers in tables; the counter is a single figure, once.
- No `target="_blank"` anywhere that leads to the app.
- No `page-text-faint` on the landing's background.
- No shadows, no glass, no rounded-24 cards.
- No sixth typeface; no serif.
- No diagonal connectors; no elbow with more than one turn.
- No content reachable by hover alone.
- No figure that is not in `UPDATE.md`, and none without its section.

## Responsive Behavior

| Name | Width | Key changes |
|---|---|---|
| Wide | ≥ 1500px | Full 3D hero; 1200px column; mandate and mirror side by side |
| Desktop | 1280–1499px | Same |
| Laptop | 961–1279px | Two-column blocks stack, mirror first; anchored notes become paragraphs; display 80 → 60 |
| Tablet | 768–960px | 3D hero still active; display 60 → 48 |
| Mobile | < 768px | **Static poster** for the hero and a **still image** of the hole behind the landing; no canvas, no player, no Lenis, no deformation; display 48 → 40; table becomes stacked rows. The app is not designed for mobile yet (`FRONT_UPDATE` § 7) and says so rather than degrading silently. |

Touch targets ≥ 44px — enforced in the hero by a hard floor on the hotspot box. Ghost pills hit 50px. Inputs 48px on mobile.

## Adaptations from source

Everything here is a departure that is **in the code or in the decision record today**. Ordered by how much it changes the system.

### The descent, the home and the glass (2026-09-26)

- **The freeze on `src/scene/` and `src/motion/` was lifted by the author** for this pass: "You can really change the art direction". The scene is now the landing and the sections are the home, joined by the descent.
- **The landing no longer releases the page.** The player's last stop is `landed`, still locked; the next scroll is `descending` (a 3.4 s tween on the player's clock, never the scrollbar), then `done`. The name blinks out on `WORD_BLINK_OUT`, the camera dollies along its axis to 0.42 units from the screen, the world is struck at 0.64, the hole emerges from 0.68. `?p=1&land=1` parks the landed scene for captures.
- **The hole gained a second framing.** `BlackHole` takes `centred` (arc framing → whole and centred) and `emerge` (0 → 1 out of the screen); the lens follows the same centre and radius. The frame dragging and the arc framing of the scene are unchanged.
- **The blur moved from the page to the components**, against the previous rule, on the author's brief: one glass sheet per section, bands transparent. On 2026-09-27 the author asked for RealGlass (github.com/Explosion-Scratch/realglass, LGPL-2.1). It is not linked: it screenshots the page once and would show a frozen ring. Its model is re-implemented in the compositing pass (`src/scene/glass.ts`) on the live ring; `backdrop-filter` is now the posters' fallback only. Contrast to re-measure on the final tint.
- **The counters are glasses of lava** (2026-09-27, option C of the author's choice, after a comparison of an SVG wave mask, a GPU fluid simulation and this). A rolling figure (9 990 bps, the 124 s clock) is drawn in the compositing pass inside its own glyphs (`src/scene/liquid.ts`): the level is the count through a damped spring (it lags, overshoots, settles), the surface carries a slow swell and a one-dimensional damped wave the pouring excites (a fast scroll raises ripples that travel and die), the body is the lava technique of three.js' `webgl_shader_lava` done procedurally — warped noise, channels overflowing 1.0 bleeding into the others — in the titles' own ignition palette — sky-orange with veins of incandescent, brighter toward the surface, nothing darker — with a cream meniscus. Nothing is drawn outside the ink: a blurred halo was tried and removed the same day, because it read as liquid outside the font. The DOM number stays for layout and assistive tech, transparent under WebGL. The CSS liquid of the previous pass is now the posters' fallback. On WebGL2 the mask textures are disposed when the canvas grows, because three.js allocates texture storage immutably at first upload.
- **The glass is clear and domed** (2026-09-27, the author: no colour, only the blur makes opacity; no inner rectangle, no facets). Tint 0, hairline gone in WebGL mode, highlight in cream at 0.06; the rim profile is a power curve on a soft-cornered field. The frosted copy leaves the star layer out: a downsampled star is a grey block.
- **The hole has a body, and the sky has depth** (2026-09-29, the author: a render closer to `public/blackhole.avif` — a total eclipse at the diamond — with the lens and the absorption kept; a real parallax for the stars, less pattern, on the model of starfield.js; nothing of the animation, the camera or the home's framing to move). The hole: the black core is BACK (a soft-edged disc at 0.975 of the horizon), the photon ring carries prominences, a corona with faint drifting rays surrounds it (pulled in and dimmed on the scene's arc, so the space around the Flex stays black), and a diamond rides the beamed side — the page's cream at its core, seven rays, a flicker — all animated as before (orbit, in-fall, shear, beaming, burn). The trade, stated: the lens's inner, inverted images are behind the core and no longer seen; the bending shows outside the ring instead. The stars: 4 800 instanced stars with a depth each (starfield.js' model — MIT, none of its code — speed, size and light ∝ 1/z), drifting down as before; the lens is applied per star in closed form, its Jacobian stretching each into a tangential arc that dims (∝ 1/√stretch) and goes out at the ring. That dimming is the absorption the author asked to keep; a lens conserves surface brightness, so it is a licence, not physics. Research read for this: ebruneton's real-time black hole shader (beam tracing, precomputed deflection), the Kerr ray tracers on GitHub, the *Interstellar* papers on the disc seen above and below the shadow — none reused, all thin-disc-in-3D approaches that do not fit a screen-space annulus.
- **The scene has a sound** (2026-09-29, the author: the desert wind under the planted key, going out as she launches; Strauss's Sunrise, one trumpet phrase per movement after a description is read, the climax on the Flex, the hole and the name; the music follows the reader's scroll and fades between the landing and the home). `src/motion/sound.ts`, Web Audio, two files from `public/`. Three cuts were built and heard the same day: four windows over the recording, one per segment; then one brass sound of the last occurrence per word, held by a granular freeze; then the same, unheld. The author refused all three and asked for the opposite: **the music plays once, continuously, from the first occurrence of the call (18.5 s) to the end, started by the launch and never cut or moved by the scroll; the scene is timed on it by its own pacing** — the calls fall about the flights and the stops, and the fortissimo at 65.5 s, forty-seven seconds after the launch, arrives on the final vision at a reading pace. The music goes on under the home and fades slowly (3.4 + 4.5 s) instead of being cut at the handover. The locating of the calls on pitch and loudness (numpy over ffmpeg's PCM) stays in the record as the measurement behind the start point. The browser's autoplay rule is the one departure from "no chrome": a small **Sound** toggle at the bottom-left of the scene, in the nav's link style, that asks for the tap the browser requires, shows the state with one dot, and remembers the choice. The home and the app stay silent. The recording's rights are the author's to clear.
- **The sky answers the reader, and two old bugs came out** (2026-09-29, the author: the field must react to the scroll, it was missing on the stops, the stars were flat). The field now moves with the reader — the sequence's own progress on the scene (a flight sweeps it, a stop holds it), 35 % of the page's scroll on the home — every star over its own depth, and streaks along the travel by the speed; each star is a hot core over white, a halo, spikes on the near bright ones, a slow twinkle, and one of three temperatures. Two bugs, both older than this pass: **the compositing pass multiplied the target by alpha a second time** (three's blending already leaves colour × alpha in it), which erased anything translucent over the transparent sky — unseen while everything there was opaque or at alpha 1; fixed, with the hole and the nebula squaring their own alpha so the approved look is unchanged (plus a 1/255 dither on the hole's tails); and **the star quads were back-face culled**, their winding reversed by the y-flip from pixels to clip space — the lens's rotated axes turned half of them back at the landing, which is why the field seemed to exist there and nowhere else; `DoubleSide`. Found by reading the render target's pixels and swapping shaders live; the hunt is in `design-shots/audit.md`.
- **Deep smoke, a focus outline, and the frieze's living link** (2026-09-28, the author: the sheets still not legible enough; the bar on the axis and its cards not understood). Compared on the same page and decided: three glasses — deep smoke (absorb 0.5, no tint), tinted smoke (0.65 + canvas-night 30 %), plate (0.7 + 55 %) — the author kept the **deep smoke**; and three ways of tying a frieze card to its span — a frame from the card down to the axis, the card standing on the axis with the width of its seconds, the card as it is with the seconds written on the axis and its outline and stem lit while live — the author kept the **living link**. In every sheet, a permanent 10 % hairline and an **incandescent outline while the sheet crosses the middle of the viewport** (an IntersectionObserver, which follows pinned sheets). Untimed steps are dashed and carry no span. The proofs and their switcher are removed.
- **The glass is smoked, and the eye is told where to land** (2026-09-28, the author: legibility, and a technical jury must catch the point of a section at once). Smoked: what the glass shows is darkened to 72 % and takes no colour (`GLASS.absorb`), the frost widens to six passes, and every glyph on a sheet carries a one-pixel shadow — the blur alone had left the ring's glow too close to the text. Where the eye lands, three things per section, all held rather than transient, which departs from "no glow that stays": a **takeaway** line first (mono, incandescent, an ember dot; its figures UPDATE.md's, its wording the author's to check), the **hot fragment** of the title — one part that cools back to incandescent instead of cream and keeps a 14 px warmth — and the **one value** in a mirror or a table that matters (`mirrorHot`, the `hot` tone in `Stats`). The call's button is incandescent. Under reduced motion the same three are simply there.
- **The proof is a frieze, not a carousel** (2026-09-27, the author: the passage of time was not felt). Time is the axis: one second is 26 px, a tick every second, a label every ten, a fixed playhead the whole track slides under, the clock counting the seconds, each timed step spanning its seconds on the line and filling as it is crossed. The steps UPDATE.md did not time (the rounds, the reconnect) take the run's unmeasured remainder between them **for their width only** — a layout, not a figure; no number is printed for them.
- **The star field is kept on the home** at 0.55, against "only the black hole is literal": the lens needs something to bend.
- **The proof reads sideways.** Section 8 (Measured) is the page's one horizontal read — the vertical scroll slides the nine steps across, the 124 s clock counts with them — because it is the one section about time. The other pinned stages are unchanged.
- **The titles carry the ring's heat: ignition.** The letters catch left to right, incandescent, and cool to cream — SplitText, built inside `onSplit` because of `autoSplit`. Chosen by the author on 2026-09-26 over two other proofs (a heat haze by SVG displacement, a horizon sweep by `background-clip: text`), both removed; they arrived with a fade, which the grammar does not cover, and ignition is the ring's own gesture. It ends in plain cream and is not a halo that stays.
- **Directions B and C were dropped**, and the dev switcher with them. `?slow=N` (dev) slows every GSAP timeline for captures.
- **The resolution behind the glass is the scene's**, `[1, 1.5]`: a half-resolution ladder was built and the author asked for the initial resolution back.
- **`/home` is a path on the same document**, written with `replaceState` at the end of the descent and read at load. A static host must rewrite `/home` to `index.html`.

### The schema joins the home (2026-10-11)

- **`/schema` left the app shell** (`src/app/SchemaPage.tsx`, `src/app/SchemaMap.tsx` → `src/components/schema/`). It is public, carries no bench state, and now stands where the home stands: the scene in its finished state, fixed under the page, every band on a glass sheet, the home's register (sentence-case titles that ignite, a takeaway first, hairline lists, the note with its left rule). The author asked for the home's presentation; the content is the overview's, re-cut, with no new figure.
- **The scene gained a `finished` prop, nothing else.** `Hero({ finished, title, catchLine, heading })`: `finished` is the state a direct load of `/home` already took (`player.jumpTo(1)`, the hole out of the screen, `data-home` and `data-glass` set), asked for by the page rather than by the path; the real descent still rewrites the path to `/home`, a page that asked for the finished state keeps its own. `HomeHero` and `HomePoster` take the title and the catch line the ring shows. `src/scene/` was not touched; `src/motion/` was not touched. The scene's own attributes are now removed when the scene unmounts, so the next page starts on a bare document.
- **One name in the ring, measured.** `SCHEMA` in `display-monolith` is narrower than `MONOLITH` (six glyphs against eight) and sits inside the ring at 1440 and at 390; the catch line runs to two lines at 30 ch.
- **No counter on the schema.** The exit pair prints `0 → 9 990 bps` without the liquid figure: the one rolling figure of the site stays the home's, and a liquid at rest still swells in the compositing pass. The exit-pair classes are reused; the `Figure` component is not.
- **Three list shapes added** for what the overview says and the landing did not: `rows` (a principle per row, its two facts on the right), `kv` (a key in mono beside what it names), `bricks-list` (a brick, its role, its line). Hairlines only, stacked below 768 px, no state, no motion once there. The three-equal-cards grids of the previous page are gone: the author's profile refuses them.
- **The map's edge labels are drawn last**, with a halo in the canvas colour: a short run ("session key") hid its word under the next box.
- **The footer is positioned.** Unpositioned, it painted *under* the fixed canvas on the home and was not seen at the end of the page; `position: relative` puts it with the bands.
- **The takeaway's ember sits on the baseline**, not the centre: at 390 px a takeaway runs to three lines and a centred dot floated between them.
- **One accent per viewport, kept**: the takeaway, the hot fragment and the one value that matters are the three held heats of a section, as on the home; the brick roles and the key roles are muted.
- **One language, and two marks banned (2026-10-11, the author).** The whole front is in English: the nav, the footer, the schema, the account's pages, the toasts and the device hints (`src/app/*`, `src/components/*`, `index.html` `lang="en"`). Routes keep their French paths (`/compte`, `/appareil`, `/connexion`): the server, the tests and the journey scripts address them. No em dash and no semicolon in any string a reader sees: a colon, a comma or a new sentence instead, and the empty-value placeholder is a middle dot. What the server sends (`msg` of a POST, the strategist's and the analyst's prose, the bots' `stop_reason`) is still the bench's French and is shown as received.
- **Cost, stated.** The schema pays what the home pays: three.js (270.5 kB gzip), the devices (Nano X FBX 5.4 MB, Stax GLB 0.87 MB) and the textures, to show the hole alone. A lighter finished entry that skips the devices would need the scene reopened; set aside. Measured on the final code (`design-shots/audit.md`): 1 WebGL canvas, 0 continuous DOM animations, 0 on mobile, 0 under reduced motion, CLS 0.0003, 0 console errors.

### The demo and the door join the home (2026-10-12)

- **`/demo` is new**, on the home's surface. One stage on a sheet: the eight scenes on the left (a real `<button>` each, four doors), the Flex in the middle, the account's panel on the right, one sentence under them, the controls. **Every Flex screen is a real capture** of the emulated device (`captures/` → `public/demo/`, 152 kB for ten screens), never a mock. Every figure is one of the measured runs: the six rounds table and the watcher's sentence in README.md, the mandate and the exception as the device displayed them (1 WETH, 300 bps, 395 bps on pool `0x1043…`), the last run's timings in APP.md (146 s). The scenes are assembled from those runs and the page says so in its source line.
- **The player decides when, the blink decides how.** `src/motion/demo.ts` (new file) holds a cursor over the beats and a timer (3.6 s a beat, 4.8 s for the last of a scene). Nothing tweens: each screen and each panel item comes on with `.blink-in`, the hero's own pulse table. Space plays, the arrows step, the scene list seeks. Under `prefers-reduced-motion` the player never auto-plays and the blink shows its end state: the reader steps.
- **A second sheet is live.** If the bench answers, the demo shows its state (Flex, fork, account, bots, positions, requests) and, once signed in, the emulated Flex's live screen (`LiveScreen`, now exported from `AppareilPage`). It reads, it never signs.
- **`/connexion` left the app shell** (`src/app/ConnexionPage.tsx` → `src/components/connexion/Connexion.tsx`). The door's logic is unchanged (`useLogin`, `PATHS`, the transport and the connection test) and stands on the home's surface: `SIGN IN` in the ring, one sheet with the three panels in order (which device, where the signature is made, sign in) beside the live Flex, then a sheet with what is yours. The three equal cards are gone. Once the bench says we are in, the page hands over to the account page that sent us, as before.
- **Two mobile rules added**: under 1280 px the demo stacks device, panel, then the scenes. The sign-in door stacks the panels over the live screen.
- **Measured** (`design-shots/demo-motion`, `connexion-motion`): one WebGL canvas, 0 continuous DOM animations, 0 on mobile, 0 under reduced motion, CLS 0.0003, 0 console errors on both pages.

### The demo goes live: the map and the cockpit (2026-10-12, the author: options A and B)

- **`/demo` has three modes**, a segmented control at the top of the stage, kept in the hash (`#map`, `#cockpit`, none for the replay): the **replay** (the real captures, the player), the **live map** and the **cockpit**. The two live modes drive the real bench through the account's own routes (`/boot`, `/chat`, `/sign_mandate`, `/bots`, `/universe`, `/run`, `/escalate`, `/escalate_no`, `/watch`, `/watch_sell`, `/analyze`) and read `GET /api/state` every 1.4 s like every account page. Nothing new is asked of the server. Without a session they show the door: one click reads the address on the emulated Flex (`/login_device`), or the sign-in page for a real Ledger.
- **The map is lit from the state** (`SchemaMap` takes `live`): a node takes a tone when it acts (incandescent), enters (green), refuses (red) or asks the holder (gold, the bench's own meaning), and its three lines are replaced by what is happening now (the account and its vault, the bots and their status, the mandate's bounds on the contract, TARE's last measure, the positions per universe). An edge named `from>to` is drawn at 2 px in the incandescent along the path a thing takes: Ledger → site → vault for a signature, site → bots → TARE → pools for a round, site → vault → Ledger for a request, MCP → analyst for a question. Every change re-keys the hot parts so they **blink on** (`.blink-in`), never fade. The activity is one pure function of the state (`live.tsx` `activity`, `mapLive`): no timer, no guess.
- **The conductor** is the journey's seven steps, each a real action, lit the way the replay's scenes are: open the session, ask for bounds (one fixed sentence), sign the mandate on the Flex, let the agents in (one round, or a bot from the form), answer the request (read and sign, or leave refused, equal weight), re-probe (and exit), ask the analyst (one fixed question). A step that waits on the device says so in the incandescent: "on the Flex".
- **TARE has its own panel**, the security level made visible: the last decision as an exit pair (what the bot saw against what the contract measured, hook in against hook out for a pool, advertised yield against the door for a vault), the bound the holder signed, the vault's verdict as a badge, the bot's own reason underneath. The rule between the two figures takes the verdict's colour.
- **The cockpit** is three columns for a projector: the agents (who runs with a live dot, add one, stop one, the holdings), the Flex large in the middle with the one sentence that says what the system is doing and whether it waits for the holder, TARE on the right. The steps run under them, then the journal and the analyst's last answer with its trace.
- **Measured live on 12 October**, from the cockpit, with the automatic holder approving the emulated Flex's screens (`scripts/porteur.py`): session, bounds (the strategist fell back to its fixed rule: the `claude` CLI could not be run by the bench), mandate clear-signed (`isBlindSign=false`, `eip7730`), a pools bot (three entries at 242, 198 and 198 bps under a 300 bps bound), re-probe, the analyst by `bots()`. Then a vaults bot: Moonwell refused at the door (2 693 bps against 300), the request back on the map in gold, the exception signed on the Flex, the position entered under exception. Zero console errors, one WebGL canvas, zero continuous DOM animations, CLS 0.0003. Captures in `design-shots/live-journey/` and `live-vaults/`.
- **What stays French**: the bench's own strings shown as received (the bots' `stop_reason`, the analyst's prose, the fallback's `source`).
- **Layout rules added**: the map is full width on the demo (it was clipped in a column), the Flex, the conductor and the agents share a three-column row under it, TARE and the holdings a two-column row; the cockpit's agents form is two columns; under 1280 px everything stacks, the Flex first in the cockpit.

### The live stage fits one screen (2026-10-12, the author: no scroll once on the demonstration)

- **The two live modes share one stage** (`src/components/demo/Stage.tsx`) that fills the viewport under the nav: `height: calc(100dvh - 88px - 40px)`, three rows (the rail, the body, the strip), nothing in it moves the page. A panel that has more to say than its room scrolls inside itself. `LiveMap.tsx` and `Cockpit.tsx` are gone.
- **Four phases, chronological, on a rail**: Setup (session, bounds, mandate), Agents, Request, Watch and analyst. Each phase folds to one line with its own summary (the mandate's bounds, the bots' tally, the requests waiting, the positions probed) and opens as a drawer when it acts. The open phase **follows the bench** (one function of the state, `activity`); a click on a phase pins it and a Follow button hands back. The map **zooms** to the region of the open phase, by a transform on its group (700 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, none under reduced motion): the Ledger, the site and the vault for the setup, the bots, TARE and the universes for the agents, the vault and the Ledger for a request, the measure and the analyst's side for the last.
- **The strip under the body** carries TARE's last measure in one line (what the bot saw, what the contract measured, the bound, the verdict) and the one sentence that says what the system does now, in the incandescent when the Flex waits for the holder.
- **Fullscreen** takes the stage alone (`requestFullscreen`), on `canvas-night`: the projector sees the rail, the map or the columns, the Flex, nothing else. The recap (the journal, the analyst's answer, the account's figures) is a band under the stage for whoever scrolls.
- **Cockpit on one screen**: the drawers on the left, the Flex in the middle (sized to the height), TARE and the agents on the right. Under 1280 px the stage gives up its fixed height and stacks.
- **Measured**: at 1440×900 and 1920×1080 the stage's bottom edge sits inside the viewport with 0 px of inner overflow, in both modes, every phase pinned (`design-shots/stage-v1/`).

### The explanation is the home (2026-10-12, the author: pour the pages into /home, keep only /home, /demo and the door)

- **`/schema` is gone.** What it said is said on the home, in the home's grammar, between the stages that already carried the argument: the principle (four rows) after the trap, the system on one sheet (the map, `src/components/landing/SchemaMap.tsx`) and the two kinds of agents with the analyst's ten tools after the rule, the six steps of a signature inside the overflow band, the account after the frieze, the two proofs under the bricks, the limits and the keys before the call, and what the holder keeps against what we hold inside the call, with a second door to the demo. The stages (the trap's counter, the rule's mirror, the frieze of 124 s) are untouched.
- **Fifteen sections, in the order of a thesis**: the scene · the claim · the trap · the principle · the agent goes in anyway · one signature · the system on one sheet · two kinds of agents · when it overflows, step by step · measured end to end · the account · what we found · three bricks · what it does not catch · the call. The content lives in `src/components/landing/content.ts` (one block per section, every figure sourced); the four list shapes in `src/components/landing/lists.tsx`.
- **The routes are `/`, `/home`, `/demo`, `/connexion` and the account's pages.** The account's pages stay: they are the product the demo drives and the door leads to. The nav lost the schema link.
- **Measured** (`design-shots/home-v2`, `home-motion-2`): 0 continuous DOM animations, 1 WebGL canvas, 0 on mobile, 0 under reduced motion, CLS 0.0002, 0 console errors. Below 900 px the map scrolls sideways in its `data-scroll`, as before.

### Three routes (2026-10-12, the author: remove the limits section, and the account's pages if the home already says what they say)

- **The limits band left the home.** The watcher's sentence it carried (a door can close after the purchase, re-probe, exit while you still can) moved into the bots' text in the agents band; the keys table is gone from the site (README.md keeps it).
- **The account's pages are deleted**: `/app`, `/app/agents`, `/app/analyste`, `/compte`, `/appareil`, their shell and their nav links. Their explanatory text was already the home's (the mandate, the bots, out of bounds, the analyst, the account, the bricks) or the door's (which device, where the signature is made). What they did is done by the demo's live modes, which drive the bench with the holder's own vault. What is not done anywhere on the site any more: the deposit and the withdrawal signed on the Ledger, the MCP key reveal and the Claude configuration to paste, the bots' history and restart, the analyst's free question, the account reset. The bench's own page (`web/index.html`) still does all of it.
- **The site is three routes**: `/` (the scene, which descends to `/home`), `/demo`, `/connexion`. Signing in lands on the demo's live map. Signed in, the nav shows the address, which leads back to the door where one signs out. The live screen and the three signing paths live in `src/app/device.tsx`.
- **The journey scripts** (`scripts/parcours-app.mjs`, `tests-usage.mjs`, `tests-appareil.mjs`) were rewritten the same evening against the demo and the two account pages (see “Five routes” below); the full journey passes on them.

### Five routes (2026-10-12, evening, the co-author: put the product back inside the surface, keep the direction)

- **Two account pages came back, on the home's surface** (`src/components/account/`, `src/components/trades/`), built only from this document's pieces: the finished hero, the glass sheets, takeaway / title / lead / panels / note / source, `kv`, `data-table`, the device mirror, the badges. No new colour, no new type, no new motion: the sheets' split titles and blur-fades, as on `/demo` and the door. `/trades` is the agents (add with name, universe, slices, pace; live; stopped, with restart), the out-of-bounds requests (the number, the two outcomes, the device mirror), the positions and their re-probe, the journal with its filters. `/account` is the funds signed on the Ledger (the vault, a deposit from the device, a withdrawal to it), the analyst's whole conversation, the address, the MCP key and the Claude configuration, what the holder did, the bench's log.
- **The demo's live modes gained what the product needs on stage**: the holder's own sentence for the bounds (with the three example chips), the funds in the setup drawer, slices and the 5-minute pace in the agents form, restart, and a compact analyst (the question field, two chips, the last two exchanges) in the watch drawer and the cockpit's third column.
- **The map says the four gestures.** The Ledger node reads `1 · sign-in: the address + a SIWE message`, `2 · deposit: one ETH transfer, signed`, `3 · mandate, exception: EIP-712 in clear`, `4 · withdrawal: an EIP-712 authorisation`; on the live map the gesture in progress is drawn incandescent (the deposit and the withdrawal light their line; the mandate and the exception keep their own screens). The bots node carries four slots, dashed when empty, filled with the bot's name and state as they are launched (`MapSlot`), the running one incandescent.
- **The door stays once signed in.** It is where the device and the signing path are changed; it hands over only after a sign-in it witnessed, to the page that asked for it (`rememberNext` / `takeNext`) or to the live map. The nav shows `Trades`, `Account` and the address (which opens the account) once an address is proven.
- **The scripts were rewritten against these pages** (`scripts/parcours-app.mjs`, `tests-usage.mjs`, `tests-appareil.mjs`, plus `shots-pages.mjs` for every page at 1440 and 390 px). They run headless without WebGL, so the hero shows its poster and the pages stay fast; everything else is the product.

### The demo is the live map alone, revealed as the journey goes (2026-10-12, the author)

- **The replay and the cockpit are gone** (`src/motion/demo.ts`, `public/demo/`, the scene script). `/demo` is the live map: the hero, one intro band, the stage, the recap.
- **The blink gave way to a reveal.** The author asked for animations that show the map as the holder's input comes in: a node the journey has not reached is dimmed and dashed and rises in when reached (opacity and a 0.97 scale over 600 ms), an edge is drawn along its length (`pathLength` 1, dash offset 1 → 0 over 900 ms) once both its ends are reached, a changed line rises in (420 ms). The reached set is cumulative and read off the state: the signer and the site at sign-in, the vault with the session, the agents' side with the first bot or round, the reading side (MCP, analyst, wallet-cli, Key Ring) with the first question. Under reduced motion every transition is instant. This departs from “blink, never fade”, on the author's call, for the demo only: the home keeps its blink tables.
- **One colour code on the whole stage**, written in the intro's takeaway: **orange** acts now, **gold** waits for the holder on the Flex (a slow pulse on the node, the rail's dot and the NOW card, the one continuous animation, stopped under reduced motion), **green** is signed or entered, **red** is refused, **grey** is not reached yet. The live edges take the colour of what travels them (gold toward the Ledger, green or red out of the vault). The Ledger node turns green once the mandate is signed.
- **The NOW card** sits above the Flex: the step the journey is at (`Step n of 7`), its colour and its word (`your move`, `on the Flex`, `working`, `done`), what to do in one sentence (the gesture on the Flex when it waits), the one filled button that does it, the second outcome when there is one (leave refused, re-probe and exit), and `Then:` the next step. The rail's phases carry a dot in the same code, the step rows in the drawers too. The open drawer takes the room that is left and scrolls inside, the folded heads stay in view.
- **Measured on 12 October**, fresh account, automatic holder: session, bounds, mandate on the Flex (gold, then green), a pools bot (one entry, one refusal, a request at 409 bps against 200 read and signed on the Flex), re-probe, the analyst, a vaults bot (Moonwell refused at 2 693 bps, the request back in gold). The stage stays inside 1440×900 with 0 px of inner overflow, 0 console errors, 0 continuous DOM animations outside a wait (`design-shots/stage-v2/`, `demo-motion-3`).

### The map says names and actions, and nothing leaves its box (2026-10-12, the author)

- **The nodes' catchphrases are gone.** Every line in a node is a name, a standard, a file or an action (`sign-in · SIWE message`, `buy(): swap + resale, same tx`, `watch.py · re-probe, exit`), on the home and on the live map alike; the live lines follow (`mandate signed`, `CannotExit → request`, `hold to sign · reject`). The NOW card's sentences say the action, not the pitch. The demo's intro keeps the colour legend and one instruction.
- **Measured with playwright-cli** (`getBBox` of every `text` against its `rect`, on `/home` and on `/demo` in each phase): two overflows found and fixed, the Ledger kicker (25 px past its box) and the journal's second line (11 px under its box, the box is 90 tall now). Every line is now clipped to its box by width (`clip`, per face), so a live value can never run out either. The drawers' step labels were the last overflow in the stage: shorter, and allowed to wrap.

### Start over, one drawer, and TARE as a module (2026-10-12, the author)

- **Start over** in the rail: `POST /api/reset` after a confirm. The mandate, the bots and the positions of the account are deleted, the bench keeps running, the stage goes back to step 1.
- **One drawer, the active phase's.** The four folded heads doubled the rail and pushed the open body out of view; the side column now holds the NOW card, the Flex and the active phase's drawer alone, whose body is the one thing that scrolls (and scrolls back to the top on a phase change). The rail is where the other phases are, and where one pins them.
- **TARE is a module of its own.** While a round runs, and for twelve seconds after the decision, a panel opens between the map (zoomed on the bots, TARE and the universes) and the side column: the figure first (what the bot saw against what was measured, counting up over 0.9 s, `power3.out`), then the four steps of the measure lit in sequence, a timed clock while the bench works since the server reports no progress (1 → 2 at 1.8 s → 3 at 4.2 s), all four when the row lands, the verdict in the stage's colours (green entered, red refused, gold under exception). For a pool: the bot picks, the hook is swapped for 89 inert bytes, quoted twice, the verdict. For a vault: the bot picks, real deposit and redeem reverted, the door, the verdict. The bot's own reason sits under the verdict, clamped to three lines. A request waiting on the Flex shows its own row, not the journal's last. A vault that refused the deposit says so, in words, where the figure goes.

### The name is Net·Out (2026-10-12, the author)

- **Net·Out**, with a middle dot: the net value of a position, measured before you enter (net), and the way out of it, yours to take (out). Written once, the same everywhere: the nav (`SITE_NAME`), the tab and the description (`index.html`), the footer, the ring on the home and the finished scene (`HOME_TITLE`, `NET·OUT`), the wordmark the Flex lands with (`PROJECT_NAME`, drawn by `makeWordmarkTexture` in the device face, uppercase), the word the OLED shows after the morph (`LANDED_WORD`), the bench's own page. `NET·OUT` is seven glyphs against `MONOLITH`'s eight: it fits the OLED at the same size, and the wordmark's brackets fit it by construction.
- The four hero posters were regenerated (`scripts/poster.mjs`). The home's posters carry no text and are unchanged.

### The pitch (2026-10-13, the author: the landing and the home sell the product to a jury)

- **The scene's third word is the name.** `SPENDING · THE EXIT · NET·OUT` (NET·OUT measures 79.7 px at 26 px on the OLED's fitter, against 92.2, 83.0 and the former THE RULE's 88.3: all at one size). The three notes were rewritten to sell: what every policy bounds and what none bounds, the six pools with the counter, three numbers signed once and what overflows coming back with the number. The ring's catch line under the name: "The net value before you enter. The way out, yours to sign." Posters regenerated.
- **The home is nine sections, one argument each** (`src/components/landing/pitch.ts`): the claim · the trap (counter kept) · what Net·Out does, in three columns NET, SIGN, OUT · one signature (mirror kept) · out of bounds does not mean no · the agents and the boundary, with the map · not a promise, a run (frieze kept) · we built on their stack, we found five things, the four bricks in one line · your Ledger stays with you, two doors. Out of the home, because they explain without selling: the account and the derived key, the six steps of a signature, the ten tools as a list, the bricks in detail, the keys. `content.ts` keeps only the frieze's steps and the findings' rows; `lists.tsx` is no longer read by the home.
- **Measured** (`design-shots/home-v3`, `home-motion-4`): 0 console errors, CLS 0.0002, budget unchanged, 138.5 kB gzip without three.js.

### The brackets, and the name as a revelation (2026-10-13, the author)

- **The Flex's lock-screen brackets frame the name in HTML too** (`src/components/Wordmark.tsx`): four right angles drawn with borders, sized in em, around `NET·OUT` in the nav and around the title in the ring on `/home` and at the end of the scene. The demo's and the door's rings (`DEMO`, `SIGN IN`) carry no brackets: the motif is the name's.
- **The scene's third word is `SOLUTION`**, not the name: `NET·OUT` appears once, on the Flex's own screen at the landing, as the revelation. `THE SOLUTION` measures 132.3 px at 26 px on the OLED's fitter and would have fallen to 22 px against the other two at 26, so the article was dropped (SOLUTION, 91.2 px, fits at 26). Posters regenerated.
- **The catch line under the name says its two halves in the titles' heat**: "The NET value before you enter. The way OUT, yours to sign.", NET and OUT in capitals, incandescent (`.hot`), the held warmth of the ignition.

### The bots' board, TARE's twin (2026-10-13, the co-author)

- **A second module beside the map**, in TARE's place and grammar (`src/components/demo/Bots.tsx`): the bots the holder launched, each with its state dot (incandescent while its round runs, green when running, dim when stopped), its universe, pace and slices, its rounds, entries, refusals, exceptions and spend, and Stop or Restart. The chosen bot gets a performance strip (entries, refusals with the blocked ones counted, exceptions, positions held, spend, the average measured exit of its entries against the mandate) and its decisions newest first: the tick, the position, what the bot saw against what the contract measured, the verdict badge, the reason for a refusal.
- **One module at a time.** TARE while a round runs and for twelve seconds after the decision; the bots' board on the agents phase once a bot exists. “Bots” and “TARE” in the rail pin either one at any phase. The map keeps the agents focus under both.

### The subject changed under the form

- **The hero was built before the subject was settled.** It was an exercise in form, it succeeded, and it is kept. What it says has been rewritten from `UPDATE.md`: the three stop words, the three descriptions and the counter. The scene, its materials, its timings, the ramp, the typography and the four motifs are **frozen**; not one file in `src/scene/` or `src/motion/` was touched in this pass.
- **The counter stopped announcing and started demonstrating.** It rolled `July → 2026` and `Wallet → 4.0`: a date and a version number. It now rolls `0 → 9 990` bps, the measured entry and exit of the same six pools (§ 4). The odometer performs the argument instead of describing it.
- **The three screen words now render at one size.** `OUR SOLUTION` fell to 21 px against 26 px for the other two, because the panel fits each word independently. `SPENDING`, `THE EXIT` and `THE RULE` were measured at 92.2, 83.0 and 88.3 px of the 112 available and all render at 26 px. **Any future word must be measured before it is adopted.**
- **`project:` was rewritten.** It described a tokenised-equity venue that no longer exists.
- **Three components described the old product and are replaced**: `order-ticket` → `mandate-card`, `cost-breakdown-row` → `journal-row`, `attestation-fingerprint` → `signer-report`. `device-screen-mirror` survives unchanged; only its example does, from a share order to the mandate and the exception the device actually shows.
- **`## Data display` was rewritten** around wei, bps, addresses and the decision journal. Tickers, price impact and the EIP-712 attestation digest belonged to the old product.

### The architecture is two surfaces

- **The landing carries the scene; the app carries none.** The measurable reason is download weight: three.js is 255.4 kB gzip and an app screen has no use for it. The app never downloads it.
- **This resolved the persistent background rather than moving it.** The `frameloop: 'always'` cost, the scrim and the tab-pause rule are **landing-only**, and the app has no contrast floor to measure against a live image.
- **One codebase, two origins.** The app cannot be a static deploy: the session cookie is HttpOnly, `/speculos/*` must be same origin, and `dist/ledger-web.js` is served by `web/server.py`. Only the landing may go to a static host. This corrects an earlier claim in this file that one deployment would do.
- **Eight components are new**, each marked `status: new` in the frontmatter: `exit-pair`, `timeline-run`, `device-screen-live`, `escalation-card`, `chat-thread`, `bot-card`, `toast`, `key-reveal`. None duplicates an existing one.
- **The server contract is fixed and this file does not negotiate with it.** Routes, the state shape and the signing protocol are `FRONT_UPDATE` §§ 2, 4 and 5. Where the bench already fixed a meaning — gold asks the bearer, green is entered, red is refused — the palette maps onto it rather than replacing it.

### The two gaps the author found are filled

- **The scrim had neither colour nor opacity** while the document said it carried legibility. It is now `#050308` at 0.72, **derived** from the worst case rather than chosen, with the arithmetic in the table and the consequence spelled out: `page-text-faint` fails at 2.46:1 and may not sit on the background.
- **Nothing paused the ring when the tab was hidden.** `visibilitychange` now stops the render **and** the scene clock; stopping the render alone would let the ring jump forward by the hidden duration on return.

### Structural, from earlier passes

- **The pin and the scrub were replaced by a stop-and-go player.** The brief assumed a 300vh pin scrubbed by ScrollTrigger. The sequence stops at each word and waits, so its length is the reader's. `spacing.hero-pin` was removed: no file read it.
- **Four acts became three stops and a four-beat finale.** The finale is morph → the hole descends → the ring catches left to right → landing.
- **A black hole was added.** Not in the brief at all. It is transparent outside its ring, and the interior is the sky's *second image*, folded through the centre. Stated plainly: that second image is a licence, not physics.
- **Gravitational lensing is applied at the source**, inside the star field, not as a post pass. A displacement of the composited target cannot bend sky *behind* an occluding object.
- **The narrative lives on the device's own screen**, one word per stop, rather than the project name at the end only.

### Colour

- **Violet entered the sky**, for the sky ramp only. Without the band a real dusk puts between night blue and warm horizon, the sky ran black-to-red in one hue. It never appears in UI.
- **Narrative ramp `text-050` → `text-950` added.** The narrative texts sit straight on the 3D scene with no scrim and no glow, so their colours come from the scene itself.
- **Page roles derived from that ramp (`page-*`)**, so the sections belong to the same world as the scene.
- **Space palette added.** The night sky is a deep blue rather than black, so the dusk → space switch reads as a complementary chord.
- **Whites and hairlines warmed**, and the frontmatter corrected to the code where the two had drifted.
- **One accent kept** against SpaceX's black-and-white rule. **State tokens added**; SpaceX has no semantic palette.

### Type

- **D-DIN → Barlow Condensed / Barlow.** D-DIN is not on Google Fonts.
- **Mono face added (JetBrains Mono)** despite SpaceX's "no mono" rule: device fields and tabular numbers are the core of the product.
- **Two families added beyond the brief**: Cabin for the anchored note, Inter for what the device writes. Both OFL, both self-hosted.
- **The Art Nouveau display register was abandoned.** Davison Art Nouveau has no current distributor. A dev bench (`src/motion/font-lab.ts`) carried six OFL stand-ins behind `?font=` and `?art=`. Two display faces were tried on the horizon title and both were dropped. With the question settled the bench, its typography token and its six packages were **removed**.
- **`display-monolith` is clamp(88px, 11.5vw, 200px)**, not the specified clamp(120px, 22vw, 320px): at the specified size the title could not share the frame with the device.
- **The horizon title is a 3D billboard**, shifted `+0.58` in X so the device hides the `Y` of "BEGIN YOUR JOURNEY" and reveals the `O`. Hiding *exactly* the Y is geometrically impossible without changing the key's pose.

### Device and screen

- **The E Ink sheet was removed**, then the flat plate that replaced it. The MONOLITH wordmark sits directly on the Flex's own surface, transparent everywhere but the ink. `device-eink` is kept as a token but nothing reads it.
- **The screen glass is drawn UNDER the lit panel.** Composited over it, the `#050505` sheet at 26 % multiplied the screen by ~0.74 and the brightest pixel measured 223 whatever the emissive was set to. Underneath, the word reaches pure white. The cost, taken deliberately: the glass no longer reflects over the word.
- **Ledger's brand faces cannot be used.** Brut Grotesque is a retail licence; HM ALPHA Mono and Ledger Mono are not distributed. Nothing was downloaded from a font-sharing site. Inter is loaded instead.

### Corrected in earlier passes

- **The shimmer's sky was truncated.** `SKY_STOPS` carries twelve stops; the shader declared `uStops[8]`. The array length is now derived from the data.
- **Dead weight removed**: the typography bench and its six font packages, `source-sans-3`, and the two unused device components in `src/scene/devices.tsx`.
- **The vignette is fenced to the scene**, refused as a page layer on measured evidence.
- **"No backdrop blur" is set aside, once**, for the landing's background, and fenced so no component may carry one.

### Still open

- **Grain and twinkle do not exist** and are not documented as if they did. Set aside by the author.
- **`withdraw` and `revoke` have no button** (`FRONT_UPDATE` § 7): the contract allows both, but they need a signed transaction rather than an EIP-712. The interface must show them as *to come* rather than hide them — it is the most visible gap in "your Ledger stays with you".
- **The app has no mobile design** (`FRONT_UPDATE` § 7). It says so rather than degrading silently.
- **Polling, not SSE** (`FRONT_UPDATE` § 2): `GET /api/state` every 1.4 s. If that becomes visible jitter in a table, the fix is in the server.
- **The signature asset (`asset/react-flow`) was never built** and `@xyflow/react` is not installed. `/schema` covers the need.
- **Micro-freezes** reported during the build are not reproducible in headless capture.
- **The second model is a Stax, not a Flex.** Its 39 MB FBX no longer ships: since 2026-09-27 the scene loads `public/Ledger_Stax.glb` (0.87 MB) — the FBX's 1273 meshes merged into the one mesh the scene drew anyway (`src/dev/fbx-export.ts`, `?export=stax`), Draco-compressed with `@gltf-transform/cli` (edgebreaker), decoded by `public/draco/`. Cloudflare Pages refuses files over 25 MB; the author chose the conversion over an R2 bucket. The FBX sources (Nano X 5.4 MB, Stax 39 MB) are the author's and are not tracked; the Nano X still loads as FBX.

## Data display

- **Amounts**: the server returns wei as strings. Show WETH with 4 decimals above 0.001, wei below. Never round a wei value into a lie.
- **Exit costs are bps**, integers, no decimals. 100 bps = 1 %. The pair entry/exit belongs in `exit-pair`.
- **Addresses** in checksum form as the server returns them, truncated in the middle only (`0xDad7…D8D`), never re-cased.
- **Thousands separator is a thin space** (`9 990`). All numbers `tabular-nums`, right-aligned in tables.
- **The decision journal**: one row per decision, in order — tick or *exc.*, bot, position, hook in and out for a pool, entry or displayed yield, exit or door, decision. A 2px left rule carries the state colour. Under the table, *N bought, M refused* and the two sentences that explain the columns.
- **Site ↔ device correspondence**: every field the bearer signs has its line on `device-screen-mirror`, in device order. A field the device does not show is marked *not shown on the device* rather than omitted.
- **The Signer Kit report** is shown, not hidden: `isBlindSign=false · eip7730` is the proof the device read fields and not a blob.
- **Counters** roll once, `0.9 s`, `power3.out`, on a figure being announced — never in a table. There is one on the site.
- **States**: loading = hairline skeleton rows, no shimmer; empty = a sentence plus one ghost action; error = `state-error` text line and a retry ghost; **signing = everything that signs is disabled, and the reason is written**; device rejected = the words, not the code; queue = the count, always visible.

## Spectacle

ambition: spectacular — **spent on the landing, with one thing left running behind it, and nothing in the app.**

background: **one** WebGL canvas (R3F 9 + drei 10 + three 0.186), a shared `progress` ref, zero `setState` in `useFrame`, no second render context — for the hero **and** for the landing sections under it. The scene is rendered into one MSAA ×4 target and composited by a single fullscreen quad.

While the hero runs: ground, sky, two devices (an FBX and a Draco GLB), an instanced star field with depth carrying its own gravitational lens per star, a black hole with a core, a ring, a corona and a diamond, and a heat-shimmer pass with a depth mask.

After the descent: **the hole, whole and centred, and the dim star field it bends**, the canvas fixed under the home, every section on its own glass sheet. Everything else is struck on the black frame of the descent. `HomePoster` (a still of the hole) below 768 px and under `prefers-reduced-motion`.

**In the app: none of it.** No canvas, no three.js, no Lenis, no background.

reveal-system: the blink tables, not a clip-path wipe. Things survive or they do not.

motion-system: Lenis synced to the GSAP ticker on the landing; the reveal data-attribute API for its sections; disabled below 768 px and in the app entirely.

signature-asset: `/schema` — who does what, from `UPDATE.md` § 2. The node-graph version was specified and never built; `@xyflow/react` is not installed.

color-drama: one accent (`sky-orange #fa520f`), states on text and hairlines only, and the bench's three fixed meanings kept (gold asks, green entered, red refused). The narrative ramp is the chromatic system of both surfaces through the `page-*` roles; the sky ramp stays confined to the hero canvas.

typography-spectacle: the oversized numeral is the exit figure in `exit-pair`. On the device it is the MONOLITH wordmark, drawn into a canvas texture with corner brackets rather than set in HTML.

motion-budget (measured, `design-shots/audit.md`): 2 continuous animations in the space phase — the star drift and the ring rotation — against a budget of 2. One WebGL canvas, none on mobile, nothing continuous under `prefers-reduced-motion`. CLS 0. Zero console errors. Hero JS excluding three.js **147.8 kB gzip** against a budget of 300, plus 3.56 kB deferred for the black hole. Tables static.

**The persistent background changes what that budget means and the audit has to say so.** On the landing below the hero the page carries exactly **one** continuous animation — the ring — against a budget of 2, and the content carries none. It is spent for a whole reading session rather than for the length of a scene, so the audit must report: the frame cost with the hole alone against the hero's, the `dpr` in force in each phase, the measured contrast of body text against the brightest frame, and that the ring stops when the tab is hidden. A budget that was true for eight seconds of hero is not automatically true for four minutes of reading. **The app's budget is zero and must measure as zero.**

## Agent Prompt Guide

1. Read the frontmatter tokens first; every colour and font in code is a CSS variable from it. `src/styles/tokens.css` is the **only** file allowed to hold a hex literal.
2. `UPDATE.md` is the source of truth for CONTENT, `FRONT_UPDATE.md` for the screens and the server contract, this file for FORM. A figure with no section reference does not go on the page.
3. The hero is finished and is the reference. Do not rebuild it; read it. `src/scene/` and `src/motion/` were reopened once, for the descent and the home (v4), and are closed again.
4. Landing and app are two surfaces. The app has no canvas, no three.js, no Lenis, and is served by `web/server.py` for the cookie and the emulator proxy.
5. On the home, inherit four things — the ramp, the type scale, the interaction grammar, and the black hole as background behind glass sheets — and inherit **none** of the rest of the 3D, the locked scroll, the heavy passes or the vignette. Data screens stay calm.
6. One accent element per viewport, one filled button per flow, no continuous animation outside the landing's background.
7. Blink things on and off; never fade them. Tie a sentence to a thing with a one-turn orange hairline. Give every revealable thing four doors. Give "leave refused" the same weight as "sign".
8. Screenshots to check: dusk at rest, a stop with its description open, the landing over the persistent background, mobile poster, reduced-motion poster, the mandate beside the mirror, an out of bounds request with a queue behind it, the journal with a refusal.
9. Any deviation from this file is written in `## Adaptations from source` before it is coded.

### Product pages (added with the bench integration, 4 October; Florent's home, scene and sound of 26–29 September brought in on 10 October)

*As of 4 October. The routes have changed since: `/`, `/demo`, `/connexion`, `/trades`, `/account` (see “Five routes”,
12 October); `/app`, `/compte`, `/appareil` and `/schema` are gone.*

The hero, its scene, its player and its timings are untouched. What was added sits under `src/app/` and
`src/styles/app.css`, and takes every value from the frontmatter.

- **Four pages, no routing library.** `/` is the hero and the pitch; `/app` the dashboard; `/compte`, `/appareil`,
  `/schema`. A History-API hook (`src/app/router.ts`); the nav links became real paths.
- **The nav is solid on product pages.** Over the hero it stays the transparent overlay; on a product page it sits on
  `canvas-night` with a hairline, because content scrolls under it. No blur. The active page is underlined in `accent`,
  the one accent element of the chrome.
- **The specified tiers were built**: `body-sm`, `mono-data`, `mono-data-lg`, and `note` as an HTML class.
- **`card-panel`, `device-screen-mirror`, `data-table`, `badge-state`, `text-input`, `cost-breakdown-row`,
  `button-sign-on-device` and `anchored-note` exist as classes.** The anchored note is two CSS borders and two dots,
  drawn once: no canvas, no timeline. Below 768 px it becomes a paragraph, as specified.
- **A quiet ghost was added** (`btn-ghost--quiet`, `--small`): `hairline-strong` border, muted text. "One ghost per
  band" holds for a pitch band; a data band has row actions (stop a bot, relaunch it, refuse a request) and they must
  not compete with the band's one action. The filled button stays unique per flow: sign the mandate, sign an exception.
- **Blinking arrives in CSS steps** (`.blink-in`, `.blink-ack`), with the hero's two pulse tables. Nothing fades.
- **One drawing: the overview map on `/schema`** (`src/app/SchemaMap.tsx`). Inline SVG in the hero's grammar — panels
  on `page-panel`, mono labels, connectors in the one accent with a dot at each end and a single right angle. The three
  roles are told by the panel's border only: `accent` for what the holder signs, `state-success` for what reads without
  acting, `state-info` for the secret. Colours are tokens, nothing is hex, no diagram library. It scrolls sideways in a
  `data-scroll` below 900 px.
- **No continuous animation was added.** Data is polled every 1.4 s and redrawn in place; the one moving thing is a
  countdown in seconds on a live bot, in tabular figures.
- **The black hole does not follow onto the app's pages.** They sit on flat `canvas-night` (level 0). It follows onto
  `/schema` since 11 October (Adaptations › The schema joins the home); the app is the author's call.
- **Copy**: the three narrative notes and the first band now tell the project's own story (an exit rule signed once on
  the Ledger); the device keeps its MONOLITH wordmark.

### Still open

- **Grain and twinkle do not exist** and are not documented as if they did. The only "grain" in the project is a sand normal map on the ground; the star field has no twinkle at all. Set aside for now by the author.
- **The `?comp=` narrative compositions and the Ledger wordmark component** are gone from the code; no spec here depends on them.
- **The signature asset (`asset/react-flow`) was never built** and `@xyflow/react` is not installed.
- **Micro-freezes** reported during the build are not reproducible in headless capture; a real-browser profile is needed.
- **44 MB of FBX** ship in the repo, and the second model is a Stax, not a Flex.

## Data display

