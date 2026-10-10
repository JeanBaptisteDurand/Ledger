/** footer-dark: one caption line. It says where the page's figures come from, in the page's own language — English under
 * the home, French under the account's pages. */
export function Footer({ product = false }: { product?: boolean }) {
  return (
    <footer className="hairline-top bg-canvas-night px-6 py-8 text-on-primary-mute md:px-8">
      <p className="t-caption m-0 max-w-[72ch] text-pretty">
        {product
          ? 'Ces pages lisent le banc en direct : un fork de Base au bloc 50 614 000, la Flex émulée ou votre Ledger. Porte de sortie — Ledger OP3N 2026.'
          : 'Every figure on this page was measured on a Base fork at block 50 614 000, on the 25 September 2026 run; the product pages read the bench live. Porte de sortie — Ledger OP3N 2026.'}
      </p>
    </footer>
  )
}
