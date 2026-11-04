// Single source of truth for the backend location.
// - Dev (vite on :5173): backend is a separate server on :3001, same host.
// - Prod (Express serves the built app): backend IS the page's origin, so
//   relative URLs just work behind Tailscale HTTPS — one origin, no CORS.
// Override with VITE_BACKEND_URL if the backend ever lives elsewhere.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : window.location.origin);
