import Icon from './Icon'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'history', label: 'Historial', icon: 'history' },
  { id: 'tasks', label: 'Tareas', icon: 'check-square' },
  { id: 'reports', label: 'Reportes', icon: 'bar-chart' },
  { id: 'assistant', label: 'Asistente IA', icon: 'sparkles' },
  { id: 'appearance', label: 'Apariencia', icon: 'palette' },
  { id: 'settings', label: 'Configuración', icon: 'settings' },
]

export default function Sidebar({ current, onNavigate }) {
  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-2 py-4 lg:w-56 lg:items-stretch lg:px-3">
      {NAV.map((item) => {
        const active = current === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-200 lg:px-4 ${
              active
                ? 'bg-white/[0.10] text-white shadow-inner-glass ring-1 ring-white/10'
                : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90'
            }`}
          >
            <Icon
              name={item.icon}
              className={`h-5 w-5 shrink-0 transition-colors ${
                active ? 'text-accent-soft' : 'text-white/55 group-hover:text-white/90'
              }`}
            />
            <span className="hidden lg:inline">{item.label}</span>
          </button>
        )
      })}
      <div className="mt-auto hidden px-2 lg:block">
        <p className="text-[10px] leading-relaxed text-white/30">
          ESP32 · ThingsBoard
          <br />
          Monitoreo ambiental
        </p>
      </div>
    </nav>
  )
}
