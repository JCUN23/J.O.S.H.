import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ProfileProvider } from './components/AuthAndProfiles/ProfileContext.jsx';
import "./style/theme.css";
import "./style/hud.css";

createRoot(document.getElementById('root')).render(
  <ProfileProvider>
    <App />
  </ProfileProvider>
)

// Register the pass-through service worker (requires a secure context:
// HTTPS, localhost, or the chrome://flags insecure-origin override).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}
