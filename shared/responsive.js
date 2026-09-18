// Shared breakpoint logic, kept in sync with the CSS breakpoints in
// shared/theme.css (and the equivalent blocks duplicated into Snake's and
// Brick Breaker's own stylesheets): <=640px is "mobile", 641-1024px is
// "tablet" (both get the stacked sidebar-above-board layout — a tablet in
// portrait doesn't have much more width than a phone, so it's safer to
// stack it too and just use roomier size caps), >1024px is "desktop"
// (side-by-side layout). Games that compute canvas pixel dimensions in JS
// call getScreenTier()/isStackedLayout() so their board never exceeds the
// space the current CSS layout actually gives it.
const RESPONSIVE_BREAKPOINTS = { mobile: 640, tablet: 1024 };

function getScreenTier() {
    const w = window.innerWidth;
    if (w <= RESPONSIVE_BREAKPOINTS.mobile) return 'mobile';
    if (w <= RESPONSIVE_BREAKPOINTS.tablet) return 'tablet';
    return 'desktop';
}

function isStackedLayout() {
    return window.innerWidth <= RESPONSIVE_BREAKPOINTS.tablet;
}
