(function () {
  "use strict";

  /* Mobile nav toggle */
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("siteNav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* Auto-hide grand opening announcements once the event has passed.
     Set by data-event-end on the homepage banner/preview and the grand-opening page section. */
  var now = new Date();
  document.querySelectorAll("[data-event-end]").forEach(function (el) {
    var end = new Date(el.getAttribute("data-event-end"));
    if (!isNaN(end.getTime()) && now > end) {
      el.hidden = true;
    }
  });
  if (now > new Date("2026-10-17T16:00:00-07:00")) {
    var navLink = document.querySelector(".nav-grand-opening");
    if (navLink) { navLink.hidden = true; }
  }

  /* Reveals a "thank you" fallback on grand-opening.html once the event has passed,
     so a direct visit after the date doesn't land on an empty page. */
  document.querySelectorAll("[data-event-passed]").forEach(function (el) {
    var end = new Date(el.getAttribute("data-event-passed"));
    if (!isNaN(end.getTime()) && now > end) {
      el.hidden = false;
    }
  });

  /* Footer year */
  var yearEl = document.getElementById("footerYear");
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

  /* Subtle one-time scroll reveal for card/media blocks (see css/styles.css
     for the opacity/transform rules this toggles). Reduced-motion visitors
     and browsers without IntersectionObserver get everything shown
     immediately rather than risk content that never appears. */
  var revealTargets = document.querySelectorAll(
    ".service-card, .rate-card, .team-card, .explore-item, .hero-media, .visit-panel, .grand-opening-media"
  );
  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (revealTargets.length) {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealTargets.forEach(function (el) { el.classList.add("is-revealed"); });
    } else {
      var revealObserver = new IntersectionObserver(
        function (entries, observer) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      revealTargets.forEach(function (el) { revealObserver.observe(el); });
    }
  }
})();
