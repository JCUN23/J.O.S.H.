import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ProfileProvider } from './components/AuthAndProfiles/ProfileContext.jsx';
import "./style/theme.css";

createRoot(document.getElementById('root')).render(
  <ProfileProvider>
    <App />
  </ProfileProvider>
)
