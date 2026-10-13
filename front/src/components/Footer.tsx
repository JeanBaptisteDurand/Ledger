/** footer-dark: one caption line. It says where the page's figures come from, and where the code they cite lives. The
 *  product pages read the bench live. */
const REPO = 'https://github.com/JeanBaptisteDurand/Ledger'
const TARE = 'https://github.com/JeanBaptisteDurand/ETH_Online_2026'
const LINK = 'underline decoration-1 underline-offset-2 hover:text-on-primary'

export function Footer({ product = false }: { product?: boolean }) {
  return (
    <footer className="hairline-top bg-canvas-night px-6 py-8 text-on-primary-mute md:px-8">
      <p className="t-caption m-0 max-w-[72ch] text-pretty">
        {product
          ? 'These pages read the bench live: a Base fork at block 50 614 000, the emulated Flex or your Ledger. Net·Out, Ledger OP3N 2026.'
          : 'Every figure on this page was measured on a Base fork at block 50 614 000. The product pages read the bench live. Net·Out, Ledger OP3N 2026.'}{' '}
        The code and every file the pages cite: <a href={REPO} target="_blank" rel="noreferrer" className={LINK}>github.com/JeanBaptisteDurand/Ledger</a>.
        The measure: <a href={TARE} target="_blank" rel="noreferrer" className={LINK}>TARE</a>, our ETHOnline 2026 instrument.
      </p>
    </footer>
  )
}
