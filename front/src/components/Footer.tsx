/** footer-dark: one caption line. It says where the page's figures come from. The product pages read the bench live. */
export function Footer({ product = false }: { product?: boolean }) {
  return (
    <footer className="hairline-top bg-canvas-night px-6 py-8 text-on-primary-mute md:px-8">
      <p className="t-caption m-0 max-w-[72ch] text-pretty">
        {product
          ? 'These pages read the bench live: a Base fork at block 50 614 000, the emulated Flex or your Ledger. Unwind, Ledger OP3N 2026.'
          : 'Every figure on this page was measured on a Base fork at block 50 614 000, on the 25 September 2026 run. The product pages read the bench live. Unwind, Ledger OP3N 2026.'}
      </p>
    </footer>
  )
}
