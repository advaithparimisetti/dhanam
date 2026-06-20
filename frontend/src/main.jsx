import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { ModeProvider } from './context/ModeContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ModeProvider>
        <App />
      </ModeProvider>
    </AuthProvider>
  </StrictMode>,
)
