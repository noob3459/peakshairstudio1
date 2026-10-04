// Deliberately minimal: a focused booking flow benefits from fewer exit
// points than the full marketing nav, while still clearly branded and with
// an easy way back to the main site.
export default function BookingHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/home.html" aria-label="Peaks Hair Studio home">
          <img
            src="/images/peaks-logo-refined.png"
            alt="Peaks Hair Studio mountain and sun logo"
            width={40}
            height={40}
            className="brand-mark"
          />
          <span className="brand-name">Peaks Hair Studio</span>
        </a>
        <a className="btn btn-small btn-secondary" href="/home.html">
          Back to site
        </a>
      </div>
    </header>
  );
}
