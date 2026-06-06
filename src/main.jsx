import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Apply saved theme on startup
const THEME_VARS = {
  purple: { '--primary':'#7c3aed','--primary-dark':'#6d28d9','--primary-light':'#ede9fe','--nav-bg':'#1e293b','--nav-accent':'#a78bfa' },
  bakery: { '--primary':'#92400e','--primary-dark':'#78350f','--primary-light':'#fef3c7','--nav-bg':'#3a1f0e','--nav-accent':'#fbbf24' },
  forest: { '--primary':'#166534','--primary-dark':'#14532d','--primary-light':'#dcfce7','--nav-bg':'#052e16','--nav-accent':'#4ade80' },
  ocean:  { '--primary':'#1d4ed8','--primary-dark':'#1e40af','--primary-light':'#dbeafe','--nav-bg':'#0f172a','--nav-accent':'#60a5fa' },
  slate:  { '--primary':'#475569','--primary-dark':'#334155','--primary-light':'#f1f5f9','--nav-bg':'#0f172a','--nav-accent':'#94a3b8' },
}
const saved = localStorage.getItem('bakery-theme') || 'purple'
const vars = THEME_VARS[saved] || THEME_VARS.purple
Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
