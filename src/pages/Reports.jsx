import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import NotConfigured from '../components/NotConfigured'
import ReportSummary from '../components/ReportSummary'
import Markdown from '../components/Markdown'
import { useSettings } from '../context/SettingsContext'
import { useTasks } from '../context/TasksContext'
import { getTimeseries } from '../lib/thingsboard'
import { WATCH_KEYS } from '../lib/sensors'
import { buildReport } from '../lib/report'
import { dayRange, weekRange, tasksInRange } from '../lib/tasks'
import { resolveModel } from '../lib/models'
import { summarizeReport } from '../lib/ai'

const PERIODS = [
  { id: 'today', label: 'Hoy', range: dayRange },
  { id: 'week', label: 'Esta semana', range: weekRange },
]

export default function Reports({ onNavigate }) {
  const { settings, isConfigured, ensureFreshToken } = useSettings()
  const { tasks, focusWindows } = useTasks()
  const [period, setPeriod] = useState('today')
  const [series, setSeries] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const range = useMemo(
    () => PERIODS.find((p) => p.id === period).range(new Date()),
    [period]
  )

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        // Mismo cálculo de cubos que la página de Historial: el servidor agrega
        // a lo largo de toda la ventana en vez de devolver solo el final.
        const interval = Math.max(1000, Math.round((range.end - range.start) / 600))
        const data = await getTimeseries(
          settings.tbHost,
          await ensureFreshToken(),
          settings.deviceId,
          WATCH_KEYS,
          range.start,
          range.end,
          { agg: 'AVG', interval }
        )
        if (!cancelled) setSeries(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // Se depende de los campos concretos, no del objeto `settings` entero: así
    // cambiar el tema o guardar un token nuevo no recarga toda la telemetría.
  }, [isConfigured, range, settings.tbHost, settings.deviceId, ensureFreshToken])

  // El resumen deja de corresponder al cambiar de período.
  useEffect(() => setSummary(''), [period])

  const report = useMemo(
    () =>
      buildReport({
        tasks: tasksInRange(tasks, range),
        allTasks: tasks,
        series,
        focusWindows,
        range,
        disabled: settings.disabledSensors || [],
      }),
    [tasks, series, focusWindows, range, settings.disabledSensors]
  )

  const requestSummary = useCallback(async () => {
    const active = resolveModel(settings)
    if (!active.apiKey) {
      setSummary(
        `Cumpliste el ${report.completion.percent} % de tus tareas (${report.completion.done} de ${report.completion.total}). ${report.pattern.headline}`
      )
      return
    }
    setSummarizing(true)
    try {
      setSummary(
        await summarizeReport({
          provider: active.provider,
          apiKey: active.apiKey,
          model: active.model,
          report,
        })
      )
    } catch {
      // Respaldo con las mismas cifras, sin depender del modelo.
      setSummary(
        `Cumpliste el ${report.completion.percent} % de tus tareas (${report.completion.done} de ${report.completion.total}). ${report.pattern.headline}`
      )
    } finally {
      setSummarizing(false)
    }
  }, [settings, report])

  if (!isConfigured) {
    return (
      <div>
        <PageHeader title="Reportes" subtitle="Conecta con ThingsBoard para ver tu rendimiento" />
        <NotConfigured onConfigure={() => onNavigate('settings')} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reportes" subtitle="Cumplimiento de tareas y calidad del entorno">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            aria-pressed={period === p.id}
            className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
              period === p.id
                ? 'bg-white/[0.10] text-white ring-1 ring-white/10'
                : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90'
            }`}
          >
            {p.label}
          </button>
        ))}
      </PageHeader>

      {error && (
        <p className="glass rounded-2xl px-5 py-4 text-sm text-status-bad">{error}</p>
      )}

      {loading ? (
        <div className="glass h-48 animate-shimmer rounded-2xl" />
      ) : (
        <ReportSummary report={report} />
      )}

      <div className="space-y-3">
        <button
          onClick={requestSummary}
          disabled={summarizing || loading}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
        >
          {summarizing ? 'Analizando…' : 'Resumen del asistente'}
        </button>
        {summary && (
          <div className="glass rounded-2xl px-5 py-4 text-sm text-white/80">
            <Markdown text={summary} />
          </div>
        )}
      </div>
    </div>
  )
}
