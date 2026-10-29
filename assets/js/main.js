/* Responsive navigation. All workshop content is available without JavaScript. */
(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-nav');
  if (!toggle || !nav) return;
  document.documentElement.classList.add('nav-enhanced');

  function setOpen(isOpen) {
    nav.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  }

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });

  const mobileLayout = window.matchMedia('(max-width: 800px)');
  mobileLayout.addEventListener('change', () => setOpen(false));
})();

/* Keep the institution name visible if a bundled logo cannot load. */
document.querySelectorAll('.institution-art img').forEach(img => {
  img.addEventListener('error', () => img.closest('.institution-art')?.classList.add('image-failed'));
  if (img.complete && img.naturalWidth === 0) img.closest('.institution-art')?.classList.add('image-failed');
});

/* An abstract spreading disturbance: decorative contours and drifting particles.
   This is artwork, not measured data or a physical hazard simulation. */
(() => {
  const canvas = document.querySelector('.mapping-field');
  const artwork = document.querySelector('.hazard-art');
  const ctx = canvas?.getContext('2d');
  if (!ctx || !artwork) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tau = Math.PI * 2;
  let width = 0, height = 0, frame = 0, visible = true;
  let elapsed = 0, previousTime = null;
  let blue, amber;

  function colors() {
    const styles = getComputedStyle(document.documentElement);
    blue = styles.getPropertyValue('--field').trim();
    amber = styles.getPropertyValue('--accent').trim();
  }
  function moving() {
    return visible && !document.hidden && !reduced.matches;
  }
  // Selected particle warning, sharing the cloud clock and reduced-motion behavior.
  function drawWarning(cx, cy, radius, phase) {
    const t = phase;
    const yellow = '#dfad20';
    const s = Math.max(19, Math.min(27, radius * .16));
    // The centre follows the same small drift as the innermost cloud contour.
    ctx.save();
    ctx.translate(cx + Math.sin(t + 1) * radius * .035, cy + Math.cos(t) * 2);
    ctx.strokeStyle = yellow;
    ctx.fillStyle = yellow;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const vertices = [[0, -s], [s * .94, s * .64], [-s * .94, s * .64]];
    function triangle(scale = 1) {
      ctx.beginPath();
      vertices.forEach(([x, y], i) => i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale));
      ctx.closePath();
    }
    function point(u) {
      const v = ((u % 1) + 1) % 1 * 3;
      const i = Math.floor(v), f = v - i;
      return [vertices[i][0] * (1 - f) + vertices[(i + 1) % 3][0] * f,
        vertices[i][1] * (1 - f) + vertices[(i + 1) % 3][1] * f];
    }
    function bang(alpha = .9) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2.7;
      ctx.beginPath(); ctx.moveTo(0, -s * .37); ctx.lineTo(0, s * .09); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, s * .34, 1.7, 0, tau); ctx.fill();
    }
    // Each point loosens into the cloud, then gathers back onto the warning edge.
    triangle(); ctx.globalAlpha = .22; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < 69; i++) {
      const u = i / 69;
      const [x, y] = point(u);
      const release = Math.max(0, Math.sin(t * 2 - u * tau)) ** 8;
      const a = Math.atan2(y, x);
      ctx.globalAlpha = .85 - release * .55;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * release * s * 1.1,
        y + Math.sin(a) * release * s * .8, i % 3 === 0 ? 1.55 : 1.05, 0, tau);
      ctx.fill();
    }
    bang(.72 + .18 * Math.sin(t * 2) ** 2);
    ctx.restore();
  }
  function draw(now) {
    frame = 0;
    if (moving() && previousTime !== null) elapsed += Math.min(now - previousTime, 64);
    previousTime = moving() ? now : null;
    const phase = reduced.matches ? 0 : elapsed / 18000 * tau;
    const radius = Math.min(width * .42, height * .45, 230);
    const cx = width * .47, cy = height * .49;
    ctx.clearRect(0, 0, width, height);

    // Uneven nested fronts suggest diffusion, heat, pressure, or uncertain terrain.
    for (let ring = 0; ring < 9; ring++) {
      const spread = (ring + 3) / 12;
      ctx.beginPath();
      for (let sample = 0; sample <= 128; sample++) {
        const angle = sample / 128 * tau;
        const ripple = 1 + .10 * Math.sin(angle * 3 + phase + spread * 3)
          + .055 * Math.cos(angle * 5 - phase + spread * 4);
        const r = radius * spread * ripple;
        const x = cx + Math.cos(angle) * r + spread * spread * radius * .15
          + Math.sin(phase + spread * 4) * radius * .035;
        const y = cy + Math.sin(angle) * r * .75
          + Math.cos(angle * 2 + phase) * radius * .035 * spread;
        if (sample === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring < 3 ? amber : blue;
      ctx.globalAlpha = ring < 3 ? .40 - ring * .035 : .26 - (ring - 3) * .022;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Sparse traces drift through the disturbance without a robot-specific motif.
    for (let i = 0; i < 36; i++) {
      const travel = ((i * .61803398875 + phase / tau * .24) % 1);
      const lane = Math.sin(i * 2.39996323);
      const x = cx + (travel * 2 - 1) * radius * 1.45;
      const y = cy + lane * radius * .85
        + Math.sin(travel * tau + phase + i) * radius * .07;
      const proximity = Math.hypot((x - cx) / radius, (y - cy) / (radius * .75));
      ctx.fillStyle = proximity < .42 ? amber : blue;
      ctx.globalAlpha = Math.sin(travel * Math.PI) ** 2 * .40;
      ctx.beginPath();
      ctx.arc(x, y, i % 9 === 0 ? 2 : 1.1, 0, tau);
      ctx.fill();
    }
    drawWarning(cx, cy, radius, phase);
    ctx.globalAlpha = 1;
    if (moving()) frame = requestAnimationFrame(draw);
  }
  function redraw() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const rect = artwork.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function updateMotion() {
    cancelAnimationFrame(frame); frame = 0; previousTime = null;
    redraw();
  }
  reduced.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    updateMotion();
  }).observe(artwork);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(artwork);
  else window.addEventListener('resize', resize);
  colors();
  resize();
  updateMotion();
})();

/* Brief entrances; content is always present, including without JavaScript. */
(() => {
  if (!('IntersectionObserver' in window)) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      observer.unobserve(target);
      if (reduced.matches || !target.animate) return;
      const animation = target.animate([
        { opacity: .55, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 450, easing: 'ease-out' });
      running.add(animation);
      animation.finished.finally(() => running.delete(animation)).catch(() => {});
    });
  }, { threshold: .08 });
  document.querySelectorAll('.section > .container').forEach(section => observer.observe(section));
  reduced.addEventListener('change', () => {
    if (reduced.matches) running.forEach(animation => animation.cancel());
  });
})();
