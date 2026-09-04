import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/GlassCard'
import HistoryChart from '../components/HistoryChart'
import NotConfigured from '../components/NotConfigured'
import Icon from '../components/Icon'
import { useSettings } from '../context/SettingsContext'
import { getTimeseries } from '../lib/thingsboard'
import { TELEMETRY_KEYS, SENSORS, classify, LEVELS } from '../lib/sensors'

const PRESETS = [
  { id: '1h', label: '1 hora', ms: 60 * 60 * 1000 },
  { id: '6h', label: '6 horas', ms: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '24 horas', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 días', ms: 30 * 24 * 60 * 60 * 1000 },
]

// Charts shown in history (distance excluded — it only drives presence).
const KEYS = TELEMETRY_KEYS.filter((k) => k !== 'distancia')

function toLocalInput(ts) {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function History({ onNavigate }) {
  const { settings, isConfigured, ensureFreshToken } = useSettings()
  const [preset, setPreset] = useState('24h')
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState(() => toLocalInput(Date.now() - 24 * 3600 * 1000))
  const [end, setEnd] = useState(() => toLocalInput(Date.now()))
  const [series, setSeries] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const range = useCallback(() => {
    if (custom) {
      return { startTs: new Date(start).getTime(), endTs: new Date(end).getTime() }
    }
    const p = PRESETS.find((x) => x.id === preset)
    const endTs = Date.now()
    return { startTs: endTs - p.ms, endTs }
  }, [custom, start, end, preset])

  const load = useCallback(async () => {
    if (!isConfigured) return
    setLoading(true)
    setError('')
    try {
      const { startTs, endTs } = range()
      // Agregación AVG en ~600 cubos a lo largo de todo el rango: así se cubre
      // la ventana completa (evita que limit recorte a las últimas horas) y se
      // renderiza con pocos puntos. Intervalo mínimo de 1 s.
      const interval = Math.max(1000, Math.round((endTs - startTs) / 600))
      const data = await getTimeseries(
        settings.tbHost,
        await ensureFreshToken(),
        settings.deviceId,
        KEYS,
        startTs,
        endTs,
        { agg: 'AVG', interval }
      )
      const parsed = {}
      for (const key of KEYS) {
        parsed[key] = (data[key] || [])
          .map((p) => ({ ts: Number(p.ts), value: Number(p.value) }))
          .filter((p) => !Number.isNaN(p.value))
          .sort((a, b) => a.ts - b.ts)
      }
      setSeries(parsed)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [isConfigured, range, settings])

  useEffect(() => {
    if (isConfigured) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, preset, custom])

  const spanDays = (() => {
    const { startTs, endTs } = range()
    return (endTs - startTs) / (24 * 3600 * 1000)
  })()

  if (!isConfigured) {
    return (
      <>
        <PageHeader title="Historial" subtitle="Evolución de las variables ambientales" />
        <NotConfigured onConfigure={() => onNavigate('settings')} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Historial" subtitle="Evolución de las variables ambientales en el tiempo">
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <Icon name={loading ? 'loader' : 'refresh'} className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </PageHeader>

      {/* Range selector */}
      <GlassCard className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setCustom(false)
                setPreset(p.id)
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                !custom && preset === p.id
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setCustom(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              custom ? 'bg-accent text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            <Icon name="calendar" className="h-3.5 w-3.5" />
            Personalizado
          </button>
        </div>

        {custom && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/85 outline-none focus:border-accent/60 [color-scheme:dark]"
            />
            <span className="text-white/40">→</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/85 outline-none focus:border-accent/60 [color-scheme:dark]"
            />
            <button
              onClick={load}
              className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-deep"
            >
              Aplicar
            </button>
          </div>
        )}
      </GlassCard>

      {error && (
        <GlassCard className="mb-5 flex items-center gap-2 p-4 text-sm text-status-bad">
          <Icon name="alert" className="h-4 w-4" /> {error}
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {KEYS.map((key) => {
          const data = series[key] || []
          const last = data.length ? data[data.length - 1].value : null
          const color = last != null ? classify(key, last).color : LEVELS.unknown.color
          return <HistoryChart key={key} sensorKey={key} data={data} color={color} spanDays={spanDays} loading={loading} />
        })}
      </div>
    </>
  )
}
