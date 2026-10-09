---
name: monolith-ledger-design
version: 2
generated_by: design-generator/design → rewritten from the built hero
date: 2026-09-25
sources:
  # The hero AS BUILT is the reference. Every value below was read out of these files, not out of a library.
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
ancestry: references/awesome-design-md/design-md/spacex/DESIGN.md (plus mistral.ai for four sky hexes) — the library direction this hero grew out of and has now superseded.
taste_profile: applied
project: Plateforme d'achat d'actions tokenisées gardées sur Ledger, où chaque ordre se lit et se signe sur l'appareil ; hero cinématique 3D "la Ledger est le monolithe de 2001", écrans produit calmes et denses en dessous.

colors:
  # ─── Canvas ───
  canvas-night: "#000000"          # page canvas, hero space, footer
  canvas-night-soft: "#0a0705"     # sections that need a lift from pure black
  canvas-panel: "#14100c"          # cards, order ticket, tables — warm-tinted
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
  sky-night: "#050308"             # one step warmer than pure black
  # ─── Regolith ground ───
  regolith-deep: "#2e1c11"
  regolith: "#6b4529"
  regolith-light: "#a8784a"
  # ─── Accent (one, Radix-style discipline) ───
  accent-incandescent: "#ffca6e"   # the narrative's announcement values
  # ─── Narrative ramp: every text colour comes from here and nowhere else ───
  # Sampled off the base scene, ordered by luminance: horizon glow → ochres → reds → roses → black.
  text-050: "#fff1d4"              # the horizon's brightest glow: body copy
  text-100: "#ffca6e"              # incandescent orange: announcement values, positive highlights
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
  state-success: "#7fb069"         # gain, order filled, signature accepted
  state-warning: "#ffb83e"         # hook cost above threshold, price impact > 50 bps, expiry near
  state-error: "#e0483a"           # loss, rejected on device, wrong chain
  state-info: "#a0b4c8"            # attestation / fingerprint notices
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
  # SPECIFIED, NOT YET BUILT — the tiers the data screens under the hero will need.
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
    note: "The ONLY filled button. Appears once per flow, when the order is ready to be sent to the device."
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
  order-ticket:
    backgroundColor: "{colors.page-panel}"
    borderColor: "{colors.page-hairline}"
    rounded: "{rounded.sm}"
    padding: 24px
    layout: "ticker + side (BUY/SELL) at top; qty + limit inputs; cost-breakdown rows; one button-sign-on-device"
  cost-breakdown-row:
    typography: "{typography.mono-data}"
    labelColor: "{colors.page-text-mute}"
    valueColor: "{colors.page-text}"
    rowBorder: "{colors.page-hairline}"
    padding: 12px 0
  device-screen-mirror:
    backgroundColor: "{colors.device-screen-off}"
    textColor: "{colors.device-screen-on}"
    borderColor: "{colors.page-hairline-strong}"
    typography: "{typography.mono-device}"
    rounded: "{rounded.device-flex}"
    padding: 20px 24px
    note: "Shows EXACTLY the fields the device shows, in the device order. One field per line. Nothing decorative."
  attestation-fingerprint:
    backgroundColor: "{colors.page-panel-raised}"
    textColor: "{colors.state-info}"
    typography: "{typography.mono-data}"
    rounded: "{rounded.xs}"
    padding: 8px 12px
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
---

## Visual Theme & Atmosphere

The discipline came from SpaceX: pure black canvas, white uppercase condensed display type, one full-bleed thing per band, one ghost pill, nothing else. This project kept the negation and swapped the medium — **the photograph became a real-time 3D scene**, and the rocket became a Ledger.

The concept is the opening of *2001: A Space Odyssey*. A black slab stands on ochre rock under a Martian dusk; three scrolls shake it loose and it launches; mid-flight it stops three times to say a word; it becomes a Ledger Flex and lands in front of a black hole. The Ledger is the monolith. The metaphor is the pitch: **the Ledger stops being a stamp at the end of the flow and becomes the dashboard**.

Kubrick's austerity is the rule. Few elements, raking light, visual silence. No glow, no neon, no mesh gradient. Light in the scene comes from the horizon and, from the first stop onward, from the device's own screen. Everything under the hero is a calm, dense, legible product surface.

**Key Characteristics**
- One canvas: `{colors.canvas-night}` `#000000`. Panels lift to `{colors.page-panel}` — warm-tinted, never grey-blue.
- Display type uppercase, condensed, positively tracked. The horizon title is `{typography.display-monolith}` and sits **behind** the device, which occludes letters on purpose.
- A single accent, `{colors.accent}` `#fa520f`, used the way SpaceX uses white: focus rings, the connector hairlines, the active tab, one key figure.
- The sky ramp lives **only in the hero canvas** and its shader twin. It never becomes a UI gradient.
- Numbers and device fields are monospace, tabular. The mono face is the voice of the Ledger screen.
- No shadows, no glassmorphism. Depth is hairlines, the vignette inside the scene, and the 3D itself. One blur exists — the page background under the sections — and it never reaches a component.
- **Violet is in the sky now.** The original direction banned it; a real dusk puts a violet band between the night blue and the warm horizon, and without it the sky ran black-to-red in one hue and read as a single orange wash.

## Hero: the stop-and-go sequence

Not a pin and not a scrub. A player (`src/motion/hero.ts`) with five states — `armed-later · idle · running · waiting · done` — drives one `progress` ref from 0 to 1. Segments play at nominal speed; a stop waits for the reader. **The length of the hero is the reader's, not a scroll distance.**

| Beat | What happens | Timing |
|---|---|---|
| **Dawn** | Scroll locked. A radial mask centred on the horizon grows from nothing and the exposure follows it. | 3.2 s, `power2.inOut` |
| **Three scrolls** | The key is driven into the ground like a marker and resists. Two refusals shake it (`0.42`, then `1`), damped `exp(−5.6t)·sin(40t)` over 0.75 s. The third tears it free. | window 220 ms per intent |
| **Takeoff** | The key leaves the sand within 20 vh and the launch carries it to the camera axis, nothing on screen. | 5 s nominal |
| **Three stops** | `CONTEXT` (roll, flat) → `THE ISSUE` (yaw, standing 18°) → `OUR SOLUTION` (pitch, settling to 9°). Each segment is one whole turn about one axis, 1.9 s, device filling 0.72 of frame height. Between them the playhead never freezes: it creeps at 7.5 % of nominal so the sky keeps evolving. | deceleration 1.0 s, drift 1 s |
| **Finale, four beats** | Nano X morphs to Flex → the black hole descends behind her → its horizon catches from left to right → she lands. | 1.2 · 1.5 · 1.2 · 1 s |

The word lights up **0.69 s before** the stop, so the key is still turning into its readable pose when the screen wakes. Order is strict: slow motion first, word second, pose last.

Poster: below 768 px and under `prefers-reduced-motion`, a static image with the word sequence printed in order. No canvas, no player.

**The sequence ends; the scene does not.** When the player releases the page, everything is struck except the black hole, which stays as the background of every section below — see `## Depth & Elevation › Page background after the hero`.

## Color Palette & Roles

### Canvas & Surfaces
- `{colors.canvas-night}` `#000000`: the page. Hero space, footer, everything between panels.
- `{colors.page-surface-lift}` `#0a0705`: bands that need a lift.
- `{colors.page-panel}` `#14100c`: cards, order ticket, tables. Warm-tinted so it never reads as slate.
- `{colors.page-panel-raised}` `#1c1712`: table headers, nested surfaces, the device-screen frame.
- `{colors.page-hairline}` `#3a2e22` / `{colors.page-hairline-strong}` `#55432f`: the only borders.

### Text
Every text colour comes from the narrative ramp and nowhere else. `{colors.text-050}` `#fff1d4` for copy, `{colors.page-text-mute}` `#d6c2a4` for labels, `{colors.page-text-faint}` `#94806a` for captions and table headers.

### Sky ramp (hero canvas only)
Twelve stops, black at both ends, the dusk in the middle:

`night 0 · night 6 % · space-deep 24 · violet 38 · rose 50 · ember 56.5 · orange 60.8 · amber 64 · peach 66 · amber 69 · regolith-deep 76 · night 100`

Interpolated `in oklab`, with a plain sRGB fallback first so a browser without `color-mix()` still gets a sky. Three radial layers give it volume: the sun's bloom tight on the horizon, the warm scatter spreading out of it, and the dome deepening toward the top corners.

The ramp exists in three copies that must agree: the hero-height CSS gradient, the `--tall` scene variant (same stops, repositioned for a 200vh layer), and the shader's `SKY_STOPS`, which the heat-shimmer pass uses to redraw the sky it displaces. **The shader's array length is derived from the data**, so a stop added to the ramp cannot be silently dropped again.

### Accent
`{colors.accent}` `#fa520f` is the single chromatic accent, Radix-style: one hue, everything else neutral. Uses: focus ring (2px), the anchored-note hairlines and dots, the active tab underline, the one key figure per screen. Never on buttons, never on backgrounds, never as glow.

### State
`state-success` gains and accepted signatures · `state-warning` hook take above threshold, impact > 50 bps, expiry < 60 s · `state-error` losses, device rejection, wrong chain · `state-info` attestation notices. Always as text and 1px borders, never as filled backgrounds.

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
| `numeral-hero` | clamp(96px, 12vw, 160px) | 600 | 1 | −0.01em | The one oversized figure per data screen | ✓ |
| `note` | clamp(17px, 1.32vw, 22px) Cabin | 400 | 1.55 | 0.005em | Anchored description, max 46ch | ✓ |
| `body-lg` | 18px | 400 | 1.7 | 0.2px | Pitch lead | ✓ |
| `body-md` | 16px | 400 | 1.5 | 0.2px | Default | ✓ |
| `button-cap` | 13px | 700 | 0.94 | 1.17px | Buttons, nav (uppercase) | ✓ |
| `micro-cap` | 12px | 400 | 2.0 | 0.96px | Eyebrows, table headers (uppercase) | ✓ |
| `caption` | 13px | 400 | 1.5 | 0 | Helper, footer | ✓ |
| `mono-device` | 15px | 500 | 1.6 | 0.04em | Device-screen mirror lines | ✓ |
| `device-wordmark` | fitted to 74 % of the panel | 600 | — | 0.16em | MONOLITH on the Flex, Inter, corner brackets | ✓ |
| `body-sm` | 14px | 400 | 1.5 | 0.2px | Secondary | — |
| `mono-data` | 14px | 400 | 1.5 | 0 | Table cells, breakdown values | — |
| `mono-data-lg` | 22px | 500 | 1.2 | −0.01em | Totals, inputs | — |

### Principles
- Display is always uppercase; the mono is uppercase only where the device is (`BUY`, `NVDA`, `LIMIT`).
- Every number is `tabular-nums`, right-aligned in tables — including a counter mid-roll, so a rolling figure cannot shift its line sideways.
- The anchored note is the one place a humanist face appears; it carries `text-wrap: pretty` and a 46ch measure.
- No sixth family. No serif.

## Interaction grammar

Four motifs the hero established. **They are the site's vocabulary, not hero details** — every section below the hero uses the same four, in HTML, without a canvas.

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
- **The anchor is a real edge of the object**, computed, not guessed: the lowest or highest crossing of its middle column, so the line never starts inside the shape whatever its pose.
- **Drawn with transforms** (`scaleY` then `scaleX`), so nothing ever leaves the compositor.

Off the hero this is how a figure is annotated, how a table row explains itself, how a diagram labels a node.

### 3. The device screen carries the instruction

The Ledger's own screen is where the site tells the reader what to do. It reads `SCROLL UP` at rest, a single word of narrative at each stop, and `SCROLL UP` again once a description has been read — and that return is what unblocks the next beat. The instruction lives on the object, not in the chrome.

The panel is one bit: 128×64, `NearestFilter`, thresholded to pure black and white, no antialiasing at any distance. Emphasis is brightness only — the word goes from a median 173 to **pure white 255** when it is the one being read. There is no underline, no bold, no halo: raising the emissive is the whole vocabulary, and it works because the glass front is drawn *under* the lit panel rather than over it.

Below the hero, the same idea: the `device-screen-mirror` shows exactly the fields the device shows, in the device order, one per line, nothing decorative.

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

**`button-sign-on-device`** — the single filled button in the system. White fill, black text. Label: "SIGNER SUR LEDGER". Once per flow, only when the order is valid.

**`anchored-note`** — the hero's connector, generalised. 1px `{colors.accent}` line, one right angle, 5px dots at both ends, `{typography.note}` text, highlights at weight 500 in the accent. Three placements exist in the hero (under, top-left, right); pick the one whose run does not cross the object.

**`order-ticket`** — `card-panel` chrome. Ticker in `display-lg` + BUY/SELL as two `micro-cap` segments, active underlined in `accent`. Inputs in `mono-data-lg`. Then the breakdown, then the sign button.

**`device-screen-mirror`** — the honest twin of the Ledger screen. One field per line, in device order:
```
BUY 0.5 NVDA
LIMIT 182.40 USDC
FEE 7 BPS
EXPIRES 14:32:10 UTC
CHAIN 84532
```

**`data-table`** — header `page-panel-raised` with `micro-cap` labels; body `mono-data`; numeric right-aligned; P&L coloured as text only. No zebra, no hover fill; hover = 1px `page-hairline-strong` left border.

**`badge-state`** · **`text-input`** · **`nav-bar-overlay`** · **`footer-dark`** — as in the frontmatter.

## Layout Principles

- Base unit 8px; tokens `xxs 4 · xs 8 · sm 12 · md 16 · lg 18 · xl 24 · xxl 32 · huge 48 · section 96`.
- Hero: full-viewport, no container, length set by the player rather than a scroll distance.
- Product content: 1200px reading column. Two-column at ≥ 1280px: order ticket left (5/12), device mirror right (7/12), so the site field and the device field sit on the same horizontal line.
- Sections separated by `section` 96px and a 1px hairline, never by a background change.
- One idea per panel.

## Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat `canvas-night` | Default |
| 1 | `page-panel` + 1px `page-hairline` | Cards, ticket, table |
| 2 | `page-panel-raised` | Table header, device frame, nested rows |
| 3 | The 3D scene | Hero only — depth is spatial, not CSS |

No box-shadow, no glow. The emissive device screen is the only "light" effect on the page and it lives inside the WebGL canvas.

**One blur exists, and only one.** The rule used to read "no backdrop blur" and the author has set it aside for a single case: the page's own background, once the hero releases. It is a page-level treatment applied once, never a chrome on a panel. **No component carries a blur, a frosted fill or a translucent surface** — the moment a card does, this is glassmorphism and the exception has been abused. See **Page background after the hero** below.

**The vignette belongs to the scene and stops there.** An ellipse `76% × 70%` at centre, transparent to 42 % of the radius and reaching `rgb(0 0 0 / 0.82)` at the corners, **plus** a lateral gradient (`.52 → .18 → 0 … 0 → .18 → .52`) because a single ellipse on a frame much wider than it is tall leaves the left and right edges lighter than the corners. The centre is never darkened.

It was mocked up as a page-level layer and refused. Over the sections it darkens the white sign button until it reads as a gradient, which this direction forbids, and at 390 px its lateral falloff eats about 94 px of each edge — half the screen. Evidence kept in `design-shots/mockups/avec-vignette-1440.png` and `avec-vignette-390.png`. It is a cinematic frame, not a product surface.

### Page background after the hero

Once the player releases the page, **the scene does not go away and it does not stay either.** Everything is struck except the black hole, which becomes the background of every section below, seen through a light blur and a slight glass deformation that keep the content readable.

| | Rule |
|---|---|
| **What is left** | The ring and its lensed sky. Ground, devices, title, star field and heat shimmer are all gone — "only the black hole" is literal. |
| **One canvas, still** | The same WebGL context, re-parented to a fixed layer behind the content. **Never a second context**, never a second scene. |
| **Where the blur lives** | In the fullscreen quad that already composites the scene — the same pass that carries the heat shimmer. **Not `backdrop-filter`**, not a CSS layer per panel: one existing pass gains a term, so the page pays for no new layer, no new stacking context and no per-panel compositing. |
| **The deformation** | Slight, slow, and on the background only. It is refraction through a sheet, not a lava lamp. It never touches a glyph. |
| **The legibility floor** | The blur is not what makes text readable; the scrim under it is. Body text over the background must clear WCAG AA against the **brightest** frame the background can produce — measured on the render, not assumed, and re-measured whenever the hole's exposure changes. |
| **Cost** | `frameloop` stays `'always'` for the whole page, so the budget below is spent continuously. Paid for by striking the rest of the scene: the ring is the cheap half. `dpr` drops to `[1, 1]` in this phase; the hero keeps `[1, 1.5]`. |
| **Mobile < 768 px** | No WebGL. A still frame of the hole, same scrim and blur in CSS, no deformation. |
| **`prefers-reduced-motion`** | The ring stops turning and the deformation is off. The still background and the scrim stay. |

## Below the hero: what is inherited

Three principles, decided after mocking a section up rather than arguing about it (`design-shots/mockups/`).

### 1. The light comes down, the frame does not

The ramp is inherited as an **order of luminance**, never as a gradient. Surfaces from the regolith end (`#0a0705 → #14100c → #1c1712`), text from the horizon end (`#fff1d4 → #d6c2a4 → #94806a`), hairlines in between, one orange. **No section paints a gradient.** The sky ramp never leaves the canvas.

The vignette does not come down (above). What does come down is the black hole itself, as the page's background.

### 2. The motion comes down as vocabulary, not as means

**Zero continuous animation in the content.** The one animated background on the page is the black hole, and it is the only one. What sections inherit is the grammar — the blink on entry, the anchored hairline, the state treatments — in CSS steps, not GSAP timelines.

What does **not** come down: the 3D of the scene, the locked-scroll player, any scrub, the heat shimmer, the star field. Lenis stays (smooth scroll is not driven scroll) and is disabled below 768 px.

### 3. Data does not move, it explains itself

No animated figure in a table, no hover fill, no chart flourish. A counter rolls once, on a figure being announced, never in a row. But the hero's explanatory grammar is exactly what dense data needs: **the one-turn hairline that ties a sentence to a number**, and **the four doors** that reach it. The `device-screen-mirror` is the literal continuation of "the object carries the instruction".

## Do's and Don'ts

### Do
- Keep a scene to four things: ground, sky, device, title. Then remove the ground.
- Render display uppercase in Barlow Condensed with positive tracking.
- Put the device mirror next to the order ticket on the same baseline; every field on the site has its line on the mirror.
- Use `accent` on at most one element per viewport, and use the anchored-note grammar whenever a sentence belongs to a thing.
- Blink things on and off. Never fade them.
- Keep the background one canvas. If a section wants its own scene, it does not get one.
- Give every revealable thing four doors.
- Draw every state: loading, empty, error, wrong chain, device rejected, attestation stale.
- Honour `prefers-reduced-motion` and the 768px poster without exception.

### Don't
- No mesh gradient, no glow, no neon green. (Violet is now allowed **in the sky only** — never in UI.)
- No blur, no frosted fill, no translucent surface **on a component**. The page background is the one blurred thing on the site.
- No vignette outside the scene.
- No sky ramp on UI surfaces; it exists only inside the hero canvas and its shader twin.
- No filled buttons except `button-sign-on-device`.
- No animated numbers in tables; counters only on a single figure.
- No shadows, no glass, no rounded-24 cards.
- No sixth typeface; no serif.
- No diagonal connectors; no elbow with more than one turn.
- No content reachable by hover alone.

## Responsive Behavior

| Name | Width | Key changes |
|---|---|---|
| Wide | ≥ 1500px | Full 3D hero; 1200px column; ticket + mirror side by side |
| Desktop | 1280–1499px | Same |
| Laptop | 961–1279px | Ticket + mirror stack (mirror first); display 80 → 60 |
| Tablet | 768–960px | 3D hero still active; display 60 → 48 |
| Mobile | < 768px | **Static poster** for the hero and a **still image** of the hole behind the sections; no canvas, no player, no Lenis, no deformation; display 48 → 40; anchored notes become ordinary paragraphs; table becomes stacked rows |

Touch targets ≥ 44px — enforced in the hero by a hard floor on the hotspot box. Ghost pills hit 50px. Inputs 48px on mobile.

## Adaptations from source

Everything here is a departure from the library direction that is **in the code today**. Ordered by how much it changes the system.

### Structural

- **The pin and the scrub were replaced by a stop-and-go player.** The brief assumed a 300vh pin scrubbed by ScrollTrigger. The sequence now stops at each word and waits, so its length is the reader's. `spacing.hero-pin` has been **removed** from the frontmatter: it was no longer read by any file.
- **Four acts became three stops and a four-beat finale.** The finale is morph → the hole descends → the ring catches left to right → landing. It used to be one beat, which read as the hole arriving halfway through the story instead of at the end of it.
- **A black hole was added.** Not in the brief at all. It is transparent outside its ring: the ring is inferred from the way the star field bends through it, and the interior is the sky's *second image*, folded through the centre. Stated plainly: that second image is a licence, not physics — a real black hole puts its shadow where the folded sky now is.
- **Gravitational lensing is applied at the source**, inside the star field, not as a post pass. A displacement of the composited target cannot bend sky *behind* an occluding object, and trying drew a second sheared copy of the device across the arc.
- **The narrative moved onto the device's own screen.** The brief put the project name on the screen only at the end; the whole story is now told there, one word per stop.

### Colour

- **Violet entered the sky.** The brief's "no violet" is set aside for the sky ramp only: without the band a real dusk puts between night blue and warm horizon, the sky ran black-to-red in one hue and read as a single orange wash. It never appears in UI.
- **Narrative ramp `text-050` → `text-950` added.** The narrative texts sit straight on the 3D scene, with no scrim and no glow, so their colours have to come from the scene itself or they read as pasted on. Sampled off the base frame and ordered by luminance. It is the only source of text colour, highlights included.
- **Page roles derived from that ramp (`page-*`).** SpaceX's neutral greys are replaced by warm near-blacks and warm off-whites from the regolith and horizon ends, so the sections under the hero belong to the same world.
- **Space palette added.** The night sky is a deep blue rather than black, so the dusk → space switch reads as a complementary chord.
- **Whites and hairlines warmed**, and warmer than first specified: the frontmatter's `#efe9e1 / #38312c / #9a8f84` had drifted from the code's `#d6c2a4 / #3a2e22 / #94806a`. The code wins; the frontmatter is now corrected to it.
- **One accent kept** against SpaceX's black-and-white rule, because focus rings, the connectors and one key figure need a hue.
- **State tokens added.** SpaceX has no semantic palette.

### Type

- **D-DIN → Barlow Condensed / Barlow.** D-DIN is not on Google Fonts; Barlow is a DIN-derived grotesk with a condensed cut.
- **Mono face added (JetBrains Mono)** despite SpaceX's "no mono" rule: device fields and tabular numbers are the core of the product.
- **Two families added beyond the brief**: Cabin for the anchored note, Inter for what the device writes. Both OFL, both self-hosted.
- **The Art Nouveau display register was abandoned.** Davison Art Nouveau has no current distributor. A dev bench (`src/motion/font-lab.ts`) carried six OFL stand-ins behind `?font=` and `?art=` — Fredoka, Rubik Mono One, Baloo 2 for the display tier, Fraunces, Yeseva One, Abril Fatface for the Art Nouveau one. Two display faces were tried on the horizon title and both were dropped; the title is back to Barlow Condensed. With the question settled the bench had no remaining purpose: it, its typography token and its six packages have been **removed**.
- **`display-monolith` is clamp(88px, 11.5vw, 200px)**, not the specified clamp(120px, 22vw, 320px). At the specified size the title could not share the frame with the device.
- **The horizon title is a 3D billboard**, not an HTML layer, so it leaves the frame with the ground when the camera rises. It is shifted `+0.58` in X so the device hides the `Y` of "BEGIN YOUR JOURNEY" and reveals the `O` — the reader sees "BEGIN OUR JOURNEY" first. Hiding *exactly* the Y is geometrically impossible without changing the key's pose; the shift is the best available and was chosen by sweep.

### Device and screen

- **The E Ink sheet was removed**, then the flat plate that replaced it. The MONOLITH wordmark now sits directly on the Flex's own surface, its texture transparent everywhere but the ink, so the device shows through between the letters. `device-eink` is kept as a token but nothing reads it.
- **The screen glass is drawn UNDER the lit panel.** Composited over it, the `#050505` sheet at 26 % multiplied the screen by ~0.74; the emissive saturated its own write at 1.0 and then lost a quarter of it, so the brightest pixel measured 223 whatever the emissive was set to. Underneath, the word reaches pure white. The cost, taken deliberately: the glass no longer reflects over the word.
- **Ledger's brand faces cannot be used.** Brut Grotesque is a retail licence; HM ALPHA Mono and Ledger Mono are not distributed at all. Nothing was downloaded from a font-sharing site to stand in. Inter is loaded instead — the face Ledger's own interface ships.

### Corrected in this pass

- **The shimmer's sky was truncated.** `SKY_STOPS` carries twelve stops; the shader declared `uStops[8]` and looped to eight, so the sky redrawn inside the shimmer band stopped at `sky-amber 0.64` and never reached the peach, the regolith or the black. The array length is now derived from the data, so the class of drift is closed.
- **Dead weight removed**: the typography bench and its six font packages, `source-sans-3` (installed, never imported), and the two unused device components in `src/scene/devices.tsx`, which now holds only the dimensions and the material types the scene still imports.

### Decided in this pass

- **The scene outlives the hero.** The brief, and every version of this file until now, assumed the canvas stopped mattering once the pin released — it even dropped to `frameloop: 'demand'` when the hero scrolled out of view. At the author's decision the black hole now stays as the background of the whole page. This is the largest change to the system since the stop-and-go player: it turns a scene with an end into a room the rest of the site is read inside.
- **"No backdrop blur" is set aside, once.** The rule in `## Depth & Elevation` was absolute. The author has taken a light blur and a slight glass deformation over that background, to keep the content readable against a live image. Recorded rather than quietly done, and fenced: it is a page-level treatment applied in the compositing pass that already exists, **never** a frosted chrome on a panel. The day a card carries a blur, this exception has been abused and the rule should be restored.
- **The vignette is fenced to the scene.** Proposed as a page-level layer, mocked up, and refused on the evidence: it turns the white sign button into a gradient and eats half the width of a 390 px screen.
- **The three inheritance principles were approved** and are written in `## Below the hero`.

### Product pages (added with the bench integration, 4 October)

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
- **The black hole does not follow onto product pages yet.** They sit on flat `canvas-night` (level 0). Re-parenting the
  canvas behind them is the author's call.
- **Copy**: the three narrative notes and the first band now tell the project's own story (an exit rule signed once on
  the Ledger); the device keeps its MONOLITH wordmark.

### Still open

- **Grain and twinkle do not exist** and are not documented as if they did. The only "grain" in the project is a sand normal map on the ground; the star field has no twinkle at all. Set aside for now by the author.
- **The `?comp=` narrative compositions and the Ledger wordmark component** are gone from the code; no spec here depends on them.
- **The signature asset (`asset/react-flow`) was never built** and `@xyflow/react` is not installed.
- **Micro-freezes** reported during the build are not reproducible in headless capture; a real-browser profile is needed.
- **44 MB of FBX** ship in the repo, and the second model is a Stax, not a Flex.

## Data display

- **Number formatting**: quantities up to 4 decimals, trimmed; prices 2 decimals with the quote unit as `micro-cap` suffix (`182.40 USDC`); fees in bps as integers (`7 BPS`) with the absolute amount in the expanded row; P&L signed with a real minus (`−12.40`), coloured as text only; percentages 2 decimals. Thousands separator is a thin space. All numbers `tabular-nums`, right-aligned.
- **Tickers** uppercase Barlow Condensed in tables, `display-lg` in the ticket header.
- **Cost breakdown**: four rows plus a total, always in the same order (pool price → pool fee → hook take → price impact → total). Any row above threshold gets a `state-warning` badge and a one-line reason. The total is the one place `accent` may appear on the ticket.
- **Site ↔ device correspondence**: each ticket field has an `id`; the mirror renders lines from the same order object. A field the device cannot display is marked "non affiché sur l'appareil".
- **Attestation**: portfolio values come from an EIP-712 message the server signs; the UI shows the digest, the timestamp, and a "Recalculer" action. Stale (> 60 s) → `state-warning`.
- **Counters** roll once, `0.9 s`, `power3.out`, and only on a figure that is being announced — never in a table.
- **States**: loading = hairline skeleton rows, no shimmer; empty = a sentence plus one ghost action; error = `state-error` text line and a retry ghost; wrong chain = badge with expected vs actual id; device rejected = the mirror shows `REJECTED`, ticket stays editable; device pending = the mirror shows the fields with a 1px `accent` left border, no spinner.

## Spectacle

ambition: spectaculaire — **spent in the hero, with one thing left running behind the rest of the page.**

background: **one** WebGL canvas (R3F 9 + drei 10 + three 0.186), a shared `progress` ref, zero `setState` in `useFrame`, no second render context — for the hero **and** for everything under it. The scene is rendered into one MSAA ×4 target and composited by a single fullscreen quad.

While the hero runs: ground, sky, two FBX devices, a procedural star field carrying its own gravitational lens, a black hole, and a heat-shimmer pass with a depth mask.

After the player releases: **the hole alone**, re-parented to a fixed layer behind the content, with the blur and the slight glass deformation added as a term in the quad that is already there. Everything else is struck. Poster below 768 px and under `prefers-reduced-motion`; a still image of the hole under the sections on mobile.

reveal-system: the blink tables, not a clip-path wipe. Things survive or they do not.

motion-system: Lenis synced to the GSAP ticker; the reveal data-attribute API for the sections under the hero; disabled below 768 px.

signature-asset: **not built.** The order-path node graph was specified and never made; `@xyflow/react` is not installed.

color-drama: one accent (`sky-orange #fa520f`), states on text and hairlines only. The narrative ramp is the chromatic system of the whole page through the `page-*` roles; the sky ramp stays confined to the hero canvas.

typography-spectacle: the oversized numeral survives as one key figure per data screen. On the device it is the MONOLITH wordmark, drawn into a canvas texture with corner brackets rather than set in HTML.

motion-budget (measured, `design-shots/audit.md`): 2 continuous animations in the space phase — the star drift and the ring rotation — against a budget of 2. One WebGL canvas, none on mobile, nothing continuous under `prefers-reduced-motion`. CLS 0. Zero console errors. Hero JS excluding three.js **147.8 kB gzip** against a budget of 300, plus 3.56 kB deferred for the black hole. Tables static.

**The persistent background changes what that budget means and the audit has to say so.** Below the hero the page carries exactly **one** continuous animation — the ring — against a budget of 2, and the content itself carries none. It is spent for the whole reading session rather than for the length of a scene, so the audit must from now on report: the frame cost with the hole alone against the hero's, the `dpr` actually in force in each phase, and the measured contrast of body text against the brightest frame the background produces. A budget that was true for eight seconds of hero is not automatically true for four minutes of reading.

## Agent Prompt Guide

1. Read the frontmatter tokens first; every colour and font in code is a CSS variable from it. `src/styles/tokens.css` is the **only** file allowed to hold a hex literal.
2. The hero is finished and is the reference. Do not rebuild it; read it.
3. Below the hero, inherit four things — the ramp, the type scale, the interaction grammar, and the black hole as the page's background — and inherit **none** of the rest of the 3D, the locked scroll, the heavy passes or the vignette. Data screens stay calm.
4. One accent element per viewport, one filled button per flow, no continuous animation outside the hero.
5. Blink things on and off; never fade them. Tie a sentence to a thing with a one-turn orange hairline. Give every revealable thing four doors.
6. Screenshots to check: dusk at rest, a stop with its description open, the landing, mobile poster, reduced-motion poster, order ticket + mirror side by side, positions table with a warning badge.
7. Any deviation from this file is written in `## Adaptations from source` before it is coded.
