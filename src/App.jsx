import { useState, useEffect } from 'react'
import AppBackground from './components/AppBackground'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import AlertToasts from './components/AlertToasts'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Tasks from './pages/Tasks'
import Reports from './pages/Reports'
import Assistant from './pages/Assistant'
import Settings from './pages/Settings'
import Appearance from './pages/Appearance'
import { useSettings } from './context/SettingsContext'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const { settings } = useSettings()

  // Al hacer clic en una notificación que apunta a una página, se navega a ella.
  useEffect(() => window.electronAPI?.onNavigate?.((route) => setPage(route)), [])

  // Aplica el tema seleccionado al documento (dirige los overrides de CSS).
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark'
  }, [settings.theme])

  return (
    <div className="flex h-screen flex-col overflow-hidden text-white">
      <AppBackground />
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar current={page} onNavigate={setPage} />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 sm:px-5 lg:px-7">
          {/* Right margin that mirrors the sidebar width so content sits
              balanced between equal left/right gutters. It grows with the
              viewport (full sidebar width on large screens) to avoid cramping
              the bento on narrower windows. */}
          <div key={page} className="animate-fade-in lg:mr-24 xl:mr-44 2xl:mr-56">
            {page === 'dashboard' && (
              <Dashboard
                onOpenAssistant={() => setPage('assistant')}
                onNavigate={setPage}
              />
            )}
            {page === 'history' && <History onNavigate={setPage} />}
            {page === 'tasks' && <Tasks />}
            {page === 'reports' && <Reports onNavigate={setPage} />}
            {page === 'assistant' && <Assistant onNavigate={setPage} />}
            {page === 'appearance' && <Appearance />}
            {page === 'settings' && <Settings onConnected={() => setPage('dashboard')} />}
          </div>
        </main>
      </div>
      <AlertToasts onOpenAssistant={() => setPage('assistant')} />
    </div>
  )
}
