import PageHeader from '../components/PageHeader'
import GlassCard from '../components/GlassCard'
import Icon from '../components/Icon'
import SensorCard from '../components/SensorCard'
import PresenceCard from '../components/PresenceCard'
import RecommendationsCard from '../components/RecommendationsCard'
import NotConfigured from '../components/NotConfigured'
import { useTelemetry } from '../context/TelemetryContext'
import { useSettings } from '../context/SettingsContext'
import { useFocus } from '../context/FocusContext'

export default function Dashboard({ onOpenAssistant, onNavigate }) {
  const { phase: focusPhase, suggestedTask } = useFocus()
  const { values, history, presence, isConfigured, lastUpdate } = useTelemetry()
  const { settings } = useSettings()
  const off = (key) => (settings.disabledSensors || []).includes(key)

  const updated = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  // When nobody is at the desk the device pauses all sensors except presence;
  // the values shown are the last recorded ones.
  const paused = presence === false

  if (!isConfigured) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Estado ambiental en tiempo real" />
        <NotConfigured onConfigure={() => onNavigate('settings')} message="Conecta con ThingsBoard desde Configuración para ver la telemetría en vivo del escritorio." />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          paused
            ? 'Monitoreo en pausa · sin presencia'
            : updated
            ? `Última lectura · ${updated}`
            : 'Esperando primera lectura…'
        }
      />

      {/* Ventana de concentración en curso. La notificación es efímera: sin este
          aviso permanente, quien no estuviera mirando la pantalla en ese momento
          no llegaba a saber nunca que su entorno estaba acompañando. */}
      {focusPhase === 'active' && !paused && (
        <GlassCard className="mb-4 flex items-center gap-3 p-3.5 ring-1 ring-status-good/30">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-good/15">
            <Icon name="check" className="h-[18px] w-[18px] text-status-good" />
          </span>
          <p className="text-sm leading-relaxed text-white/70">
            <span className="font-medium text-status-good">Ventana de concentración.</span>{' '}
            {suggestedTask ? (
              <>
                Tu entorno acompaña ahora mismo. Buen momento para{' '}
                <span className="font-medium text-white/90">«{suggestedTask.title}»</span>.
              </>
            ) : (
              'Tu entorno acompaña ahora mismo: buen momento para una tarea que exija concentración.'
            )}
          </p>
        </GlassCard>
      )}

      {paused && (
        <GlassCard className="mb-4 flex items-center gap-3 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
            <Icon name="user-x" className="h-[18px] w-[18px] text-white/55" />
          </span>
          <p className="text-sm leading-relaxed text-white/55">
            <span className="font-medium text-white/75">Monitoreo en pausa.</span> No hay nadie en el
            escritorio; el dispositivo solo registra los demás sensores cuando detecta presencia. Los
            valores mostrados son los últimos registrados.
          </p>
        </GlassCard>
      )}

      {/* Responsive bento:
          · base (<640px): single column, cards size to content.
          · sm–lg (640–1023px): balanced 2-column flow (no stretched cards).
          · lg+ (≥1024px): exact 4×4 bento pinned with col-start/row-start.
          DOM order is tuned for the 2-col flow; lg positions are explicit so
          order doesn't affect the bento arrangement. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:auto-rows-[190px] sm:gap-4 lg:grid-cols-4 lg:auto-rows-[168px] xl:auto-rows-[190px]">
        {/* Presence — lg: tall & narrow, top-left */}
        <PresenceCard
          present={presence}
          distance={values.distancia}
          className="lg:col-span-1 lg:row-span-2 lg:col-start-1 lg:row-start-1"
        />

        {/* PM2.5 — lg: big square, bottom-left */}
        <SensorCard
          sensorKey="pm25"
          value={values.pm25}
          history={history.pm25}
          large
          paused={paused}
          disabled={off('pm25')}
          className="lg:col-span-2 lg:row-span-2 lg:col-start-1 lg:row-start-3"
        />

        {/* Secondary sensors — small blocks */}
        <SensorCard sensorKey="temperatura" value={values.temperatura} history={history.temperatura} paused={paused} disabled={off('temperatura')} className="lg:col-start-2 lg:row-start-1" />
        <SensorCard sensorKey="humedad" value={values.humedad} history={history.humedad} paused={paused} disabled={off('humedad')} className="lg:col-start-2 lg:row-start-2" />
        <SensorCard sensorKey="luz" value={values.luz} history={history.luz} paused={paused} disabled={off('luz')} className="lg:col-start-3 lg:row-start-4" />
        <SensorCard sensorKey="ruido" value={values.ruido} history={history.ruido} paused={paused} disabled={off('ruido')} className="lg:col-start-4 lg:row-start-4" />

        {/* AI assistant — lg: tallest dominant block (right); sm: full-width */}
        <RecommendationsCard
          onOpenAssistant={onOpenAssistant}
          className="sm:col-span-2 sm:row-span-2 lg:col-span-2 lg:row-span-3 lg:col-start-3 lg:row-start-1"
        />
      </div>
    </>
  )
}
