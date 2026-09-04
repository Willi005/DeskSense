import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'
import App from './App.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
import { TelemetryProvider } from './context/TelemetryContext.jsx'
import { TasksProvider } from './context/TasksContext.jsx'
import { AlertsProvider } from './context/AlertsContext.jsx'
import { FocusProvider } from './context/FocusContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <TelemetryProvider>
        <TasksProvider>
          <AlertsProvider>
            <FocusProvider>
              <App />
            </FocusProvider>
          </AlertsProvider>
        </TasksProvider>
      </TelemetryProvider>
    </SettingsProvider>
  </React.StrictMode>
)
