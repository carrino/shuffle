// Shared top navigation. Plain <a href> links between the static pages so it
// works identically on the dev server, GitHub Pages and any static host.

const PAGES = [
  ['index.html', 'Explore'],
  ['sweep.html', 'Sweep'],
  ['capture.html', 'Capture'],
  ['data.html', 'Data'],
  ['validate.html', 'Validate'],
] as const;

export function mountNav(active: string): void {
  const nav = document.createElement('nav');
  nav.className = 'topnav';
  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = '🂡 shuffle';
  nav.appendChild(brand);
  for (const [href, label] of PAGES) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === active) a.className = 'active';
    nav.appendChild(a);
  }
  document.body.prepend(nav);
}
