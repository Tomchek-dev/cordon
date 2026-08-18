export type FontSize = 'normal' | 'large' | 'xl';

// Inlined into <head> as a blocking script so the correct size is applied
// before first paint - keep this in sync with getFontSize()/setFontSize()
// below. Independent of theme (data-theme) - applies the same in light and
// dark, since it's just a root font-size scale that every rem-based
// Tailwind text utility inherits from.
export const FONT_SIZE_INIT_SCRIPT = `
(function () {
  try {
    var s = localStorage.getItem('fontSize');
    if (s === 'large' || s === 'xl') document.documentElement.setAttribute('data-font-size', s);
  } catch (e) {}
})();
`;

export function getFontSize(): FontSize {
  if (typeof window === 'undefined') return 'normal';
  const s = localStorage.getItem('fontSize');
  return s === 'large' || s === 'xl' ? s : 'normal';
}

export function setFontSize(size: FontSize) {
  if (size === 'normal') {
    document.documentElement.removeAttribute('data-font-size');
  } else {
    document.documentElement.setAttribute('data-font-size', size);
  }
  localStorage.setItem('fontSize', size);
}

export function nextFontSize(current: FontSize): FontSize {
  if (current === 'normal') return 'large';
  if (current === 'large') return 'xl';
  return 'normal';
}
