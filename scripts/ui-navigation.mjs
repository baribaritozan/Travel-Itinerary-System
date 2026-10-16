// Regression tests keep their original feature assertions. This adapter follows
// Phase 5's real menu/map/comparison buttons before acting on a relocated control.
// It does not change DOM state or call application functions.
export function withNavigation(page) {
  const nativeLocator = page.locator.bind(page);
  async function prepare(locator) {
    if (!await locator.count()) return;
    const where = await locator.first().evaluate(el => {
      const parents = []; for (let parent = el.parentElement; parent; parent = parent.parentElement) parents.push(parent);
      return {
      menu: Boolean(el.closest('.more-menu')), map: Boolean(el.closest('.map-panel')),
      compare: Boolean(el.closest('.select-toggle, .comparison-tools')),
      summaries: parents.filter(parent => parent.tagName === 'DETAILS' && !parent.open && parent.firstElementChild !== el).map(parent => parent.className.split(' ')[0]),
    }; });
    const dialog = nativeLocator('.more-menu');
    if (await dialog.count()) {
      const open = await dialog.evaluate(el => el.open);
      if (where.menu && !open) await nativeLocator('.nav-more').click();
      if (!where.menu && open) await nativeLocator('.close-menu').click();
    }
    if (where.map && await nativeLocator('.map-panel').getAttribute('data-mode') === 'minimal') await nativeLocator('.nav-map').click();
    if (where.map && await nativeLocator('.map-panel').getAttribute('data-compact') === 'true' && await locator.first().evaluate(el => Boolean(el.closest('.location-panel')))) await nativeLocator('[data-mode="expanded"]').click();
    if (!where.map && await nativeLocator('.timeline-panel').count() && await nativeLocator('.timeline-panel').evaluate(el => el.inert)) await nativeLocator('.nav-map').click();
    if (where.compare && await nativeLocator('.nav-compare').count() && await nativeLocator('.nav-compare').getAttribute('aria-pressed') !== 'true') await nativeLocator('.nav-compare').click();
    for (const cls of where.summaries.reverse()) await nativeLocator(`.${cls} > summary`).click();
  }
  const actions = new Set(['click','tap','focus','check','uncheck','fill','press','scrollIntoViewIfNeeded']);
  const chains = new Set(['locator','filter','first','last','nth','getByRole','getByText','getByLabel']);
  const wrap = locator => new Proxy(locator, { get(target, key) {
    if (typeof target[key] !== 'function') return target[key];
    if (actions.has(key)) return async (...args) => { await prepare(target); return target[key](...args); };
    if (chains.has(key)) return (...args) => wrap(target[key](...args));
    return target[key].bind(target);
  } });
  page.locator = (...args) => wrap(nativeLocator(...args));
  const nativeRole = page.getByRole.bind(page); page.getByRole = (...args) => wrap(nativeRole(...args));
  return page;
}
