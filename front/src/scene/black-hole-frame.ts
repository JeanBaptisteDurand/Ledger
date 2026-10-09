/**
 * Where the black hole is and how hard it bends, as pure geometry.
 *
 * It lives in its own module because two places need it and one of them must not pull in the other. The hole
 * itself (src/scene/BlackHole.tsx) is a lazily-loaded chunk fetched once, late, just before the morph; the
 * scene needs the same numbers from the FIRST frame, because the lensing is applied to the star field from the
 * moment the field exists and not from the moment the hole arrives. Importing the formula from the hole would
 * have dragged the chunk into the initial bundle and undone the whole point of deferring it.
 *
 * WHEN THE LENS TURNS ON. With the hole, on its own beat, and not before. It used to come up with the star
 * field so that the map would never change while the reader was watching — a ramping map moves every star at
 * once, and measured on the sequence that read as the camera panning. But it also meant the sky was visibly
 * bent from the second screen word onward, which gave the hole away long before it arrived. The ramp is back,
 * and it is now the arrival itself: the hole falls into place and drags the sky with it, on a beat of its own
 * after the morph, with nothing else moving. The term that made the ramp read as a PAN rather than a fall is
 * the twist, and that is zero (see below).
 */

/**
 * Radius, in screen pixels, of the circle through both top corners of the viewport whose lowest point sits on
 * the middle of the screen. The framing asked for: the bottom of the hole in frame, the top of it out of it.
 */
export const arcRadiusPx = (w: number, h: number) => (h * h + w * w) / (4 * h)

/**
 * The Einstein radius, in arc radii.
 *
 * One, so that the deflection is total exactly at the drawn ring and the sky is visibly wrung out from there
 * outward. At the third of an arc radius it was before, the region where the bending is legible sat inside the
 * ring, which on this framing is off the top of the screen: the only arc in frame is the bottom one, and there
 * was nothing to see on it. The ring now marks the edge of the effect instead of floating over a sky that
 * ignores it.
 */
export const EINSTEIN_K = 1

/**
 * How far, in radians, a sample at the Einstein radius is swung around the hole. ZERO, and deliberately.
 *
 * Frame dragging is real and the term is correct, but it cannot be read at this framing. The centre of the
 * hole is above the screen, so every visible point is on the same side of it, and a rotation about a centre
 * you cannot see is a uniform sideways slide of everything you can: a camera pan, not a swirl. Measured at
 * 1.15 degrees over the arrival, which is the sideways drift the author saw. It is kept as a named zero rather
 * than deleted because the term becomes legible the moment the composition puts the centre back in frame.
 */
export const LENS_TWIST = 0

/**
 * How much higher the hole sits before it comes down, as a share of its radius. The fall is the arrival: the
 * ring is drawn where it lands and the sky is bent by however much of the hole has arrived, so the two are one
 * gesture and the reader sees the sky being drawn in as the mass comes down.
 */
export const HOLE_FALL_LIFT = 0.34

/**
 * The hole as the star field's shader needs it: centre and Einstein radius in CSS pixels, and how present the
 * field itself is. Written from useFrame, read by useFrame; never React state.
 */
export type LensState = { x: number; y: number; radius: number; amount: number; strength: number }
