/**
 * The app's layering ladder, observed in the wild: `z-40` nav, `z-[80]`
 * drawers, `z-[120]` ConfirmModal, `z-[130]` topmost sheets.
 *
 * New overlays take these constants via inline `style={{ zIndex }}` —
 * Tailwind cannot generate dynamic z classes.
 */
export const Z = {
  nav: 40,
  drawer: 80,
  modal: 120,
  alert: 130,
  toast: 140,
} as const;
