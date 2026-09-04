import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/GlassCard'
import Icon from '../components/Icon'
import { useSettings } from '../context/SettingsContext'
import ModelSelector from '../components/ModelSelector'
import Toggle from '../components/Toggle'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-white/60">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-white/35">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white/90 placeholder-white/30 outline-none transition-colors focus:border-accent/60'

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${inputCls} pr-10`}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white/70"
      >
        {show ? 'Ocultar' : 'Ver'}
      </button>
    </div>
  )
}

export default function Settings({ onConnected }) {
  const { settings, update, connect } = useSettings()
  const [form, setForm] = useState(settings)
  const [connecting, setConnecting] = useState(false)
  const [result, setResult] = useState(null) // { ok, message }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleConnect = async () => {
    setConnecting(true)
    setResult(null)
    try {
      const { token, deviceId, error } = await connect({
        tbHost: form.tbHost,
        tbUsername: form.tbUsername,
        tbPassword: form.tbPassword,
        deviceName: form.deviceName,
      })
      setForm((f) => ({ ...f, jwt: token, deviceId }))
      if (deviceId) {
        setResult({ ok: true, message: 'Conexión exitosa. Dispositivo encontrado y telemetría activa.' })
      } else {
        setResult({
          ok: false,
          message: `Autenticación correcta, pero ${error} Puedes pegar el Device ID manualmente (en ThingsBoard: abre el dispositivo → "Copy device ID") y pulsar Guardar.`,
        })
      }
    } catch (e) {
      setResult({ ok: false, message: e.message || 'Error de conexión' })
    } finally {
      setConnecting(false)
    }
  }

  const handleSave = () => {
    // aiModelId is applied instantly by ModelSelector; don't let the form's
    // stale value clobber it on save.
    update({ ...form, aiModelId: settings.aiModelId })
    setResult({ ok: true, message: 'Configuración guardada.' })
  }

  return (
    <>
      <PageHeader title="Configuración" subtitle="Conexión a ThingsBoard y asistente de IA" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ThingsBoard */}
        <GlassCard className="p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
              <Icon name="wifi" className="h-[18px] w-[18px] text-accent-soft" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-white">ThingsBoard</h3>
              <p className="text-xs text-white/45">Servidor de telemetría IoT</p>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Servidor (host)">
              <input className={inputCls} value={form.tbHost} onChange={set('tbHost')} placeholder="http://200.13.5.20:8080" />
            </Field>
            <Field label="Usuario">
              <input className={inputCls} value={form.tbUsername} onChange={set('tbUsername')} autoComplete="username" placeholder="Ingresa tu correo electrónico" />
            </Field>
            <Field label="Contraseña">
              <SecretInput value={form.tbPassword} onChange={set('tbPassword')} placeholder="••••••••" />
            </Field>
            <Field label="Nombre del dispositivo">
              <input className={inputCls} value={form.deviceName} onChange={set('deviceName')} placeholder="Nombre del dispositivo en ThingsBoard" />
            </Field>

            <button
              onClick={handleConnect}
              disabled={connecting || !form.tbPassword}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-deep active:scale-[0.99] disabled:opacity-40"
            >
              <Icon name={connecting ? 'loader' : 'key'} className={`h-4 w-4 ${connecting ? 'animate-spin' : ''}`} />
              {connecting ? 'Conectando…' : 'Conectar y obtener token'}
            </button>

            <Field label="JWT Token" hint="Se completa automáticamente al conectar. También puedes pegarlo manualmente.">
              <textarea
                className={`${inputCls} h-20 resize-none font-mono text-[11px] leading-relaxed`}
                value={form.jwt}
                onChange={set('jwt')}
                placeholder="Se completa automáticamente al conectar. También puedes pegarlo manualmente"
                data-selectable
              />
            </Field>

            <Field label="Device ID (resuelto)" hint="UUID del dispositivo usado para la REST API y el WebSocket.">
              <input className={`${inputCls} font-mono text-[11px]`} value={form.deviceId} onChange={set('deviceId')} placeholder="se resuelve al conectar" data-selectable />
            </Field>
          </div>
        </GlassCard>

        {/* Anthropic + device */}
        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
                <Icon name="sparkles" className="h-[18px] w-[18px] text-accent-soft" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-white">Asistente de IA</h3>
                <p className="text-xs text-white/45">Modelo, recomendaciones y chat</p>
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Modelo activo" hint="También puedes cambiarlo desde el selector en la pantalla del Asistente.">
                <ModelSelector block />
              </Field>
              <Field label="API Key de OpenRouter" hint="Para los modelos Gemini, GPT y Llama.">
                <SecretInput value={form.openrouterApiKey} onChange={set('openrouterApiKey')} placeholder="sk-or-v1-…" />
              </Field>
              <Field label="API Key de Anthropic" hint="Solo para los modelos Claude. Nunca se envía a ThingsBoard.">
                <SecretInput value={form.anthropicApiKey} onChange={set('anthropicApiKey')} placeholder="sk-ant-…" />
              </Field>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/75">Alertas automáticas</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
                    Aviso en pantalla y notificación con un consejo de la IA cuando una métrica llega a
                    nivel alto o crítico.
                  </p>
                </div>
                <Toggle
                  checked={form.alertsEnabled !== false}
                  onChange={() => setForm((f) => ({ ...f, alertsEnabled: f.alertsEnabled === false }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/75">Ventanas de concentración</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
                    Avisa cuando tu entorno lleve 10 minutos en condiciones óptimas y te
                    sugiere una tarea que exija concentración.
                  </p>
                </div>
                <Toggle
                  checked={form.focusEnabled !== false}
                  onChange={() => setForm((f) => ({ ...f, focusEnabled: f.focusEnabled === false }))}
                />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="mb-3 text-sm font-semibold text-white">Token de acceso del dispositivo</h3>
            <Field label="Access Token (MQTT del ESP32)" hint="Referencia del token usado por el ESP32 para publicar.">
              <input className={`${inputCls} font-mono text-[11px]`} value={form.deviceAccessToken} onChange={set('deviceAccessToken')} data-selectable />
            </Field>
          </GlassCard>

          {result && (
            <GlassCard className={`flex items-start gap-2.5 p-4 text-sm ${result.ok ? 'text-status-good' : 'text-status-bad'}`}>
              <Icon name={result.ok ? 'check' : 'alert'} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{result.message}</span>
            </GlassCard>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
            >
              Guardar configuración
            </button>
            {settings.jwt && settings.deviceId && (
              <button
                onClick={onConnected}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
              >
                Ir al Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
