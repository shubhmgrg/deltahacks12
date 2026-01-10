import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'mapbox-gl/dist/mapbox-gl.css'

// Import fonts
import '@fontsource/inter'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono'
import '@fontsource/jetbrains-mono/500.css'

import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
