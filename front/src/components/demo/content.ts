/** The demo's hero: what the ring says over the live map. House rule for every string: no dash, no semicolon. */
export const HERO = {
  title: 'DEMO',
  catch: 'Live on the bench, with the emulated Flex.',
  heading: 'Demo: the system live on the map',
}

export const INTRO = {
  title: ['The system, ', 'live on the map.', ''] as const,
  takeaway: 'Orange: acting now · gold: waiting for you on the Flex · green: signed or entered · red: refused',
  lead: 'The card above the Flex says what to do next.',
  source: 'GET /api/state every 1.4 s, the bench’s own routes for every action (FRONT.md § 4). Nothing is asked of the server that the account’s pages do not already ask.',
}
