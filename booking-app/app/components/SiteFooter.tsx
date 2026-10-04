// Mirrors the footer markup in the static public/*.html pages, so /book
// matches the rest of the site exactly.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="mountain-motif" aria-hidden="true">
        <svg viewBox="0 0 1200 160" preserveAspectRatio="none" focusable="false">
          <path
            d="M0 160 L140 60 L230 120 L360 30 L480 120 L620 50 L760 130 L900 40 L1040 120 L1200 70 L1200 160 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="container footer-inner">
        <div className="footer-brand">
          <img
            src="/images/peaks-logo-refined.png"
            alt="Peaks Hair Studio mountain and sun logo"
            width={48}
            height={48}
          />
          <p>Peaks Hair Studio</p>
        </div>
        <ul className="footer-links">
          <li><a href="/services.html">Services</a></li>
          <li><a href="/team.html">Our Team</a></li>
          <li><a href="/visit.html">Visit</a></li>
          <li><a href="tel:7604496456">760-449-6456</a></li>
          <li><a href="mailto:peakshairstudio@gmail.com">peakshairstudio@gmail.com</a></li>
          <li>
            <a href="https://www.instagram.com/peaks_hair_studio/" target="_blank" rel="noopener noreferrer">
              @peaks_hair_studio
            </a>
          </li>
        </ul>
        <p className="footer-copy">
          &copy; {new Date().getFullYear()} Peaks Hair Studio. 15940 Quantico Rd, Suite 130, Apple Valley, CA 92307.
        </p>
      </div>
    </footer>
  );
}
