import { LEVELS } from '../lib/sensors'

// Traduce el índice 0–100 a un nivel, con los mismos cortes que levelAt.
function indexLevel(index) {
  if (index == null) return LEVELS.unknown
  if (index >= 84) return LEVELS.good
  if (index >= 50) return LEVELS.moderate
  if (index >= 17) return LEVELS.bad
  return LEVELS.severe
}

function StatCard({ label, value, caption, color }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-semibold tnum" style={color ? { color } : undefined}>
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-white/45">{caption}</p>}
    </div>
  )
}

export default function ReportSummary({ report }) {
  const { completion, environment, focus, pattern } = report
  const level = indexLevel(environment.index)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Cumplimiento"
          value={`${completion.percent} %`}
          caption={`${completion.done} de ${completion.total} tareas`}
        />
        <StatCard
          label="Índice de entorno"
          // Sin datos no es lo mismo que un entorno pésimo: nunca se muestra 0.
          value={environment.index == null ? 'Sin datos' : environment.index}
          caption={level.label}
          color={environment.index == null ? undefined : level.color}
        />
        <StatCard
          label="Concentración"
          value={focus.count}
          caption={`${focus.totalMinutes} min en total`}
        />
      </div>

      <div className="glass rounded-2xl px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-white/40">Patrón observado</p>
        <p className="mt-2 text-sm text-white/85">{pattern.headline}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">
          Patrón observado sobre las tareas del período. No constituye una correlación
          estadística: la cantidad de datos no lo permite.
        </p>
      </div>
    </div>
  )
}
