/** footer-dark: one caption line. It says where the page's figures come from, in the page's own language. */
export function Footer() {
  return (
    <footer className="hairline-top bg-canvas-night px-6 py-8 text-on-primary-mute md:px-8">
      <p className="t-caption m-0 max-w-[72ch] text-pretty">
        Every figure on this page was measured on a Base fork at block 50 614 000, on the 25 September 2026 run; the product pages read the bench live. Porte de sortie — Ledger OP3N 2026.
      </p>
    </footer>
  )
}
