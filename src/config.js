// Single source of truth for the backend location.
// Derives the host from whatever served the page, so the laptop hits 127.0.0.1,
// the wall tablet hits the LAN IP, and a future always-on box just works.
// Override with VITE_BACKEND_URL in .env if the backend ever lives elsewhere.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  `${window.location.protocol}//${window.location.hostname}:3001`;
