import { useRef, useState } from 'react'
import Icon from './Icon'
import { useSettings } from '../context/SettingsContext'
import { resolveModel } from '../lib/models'
import { parseTask, parseTaskFromAudio } from '../lib/ai'
import { startRecording } from '../lib/voice'
import { toDateKey } from '../lib/tasks'

export default function TaskComposer({ onCreate }) {
  const { settings } = useSettings()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const recorderRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [voiceError, setVoiceError] = useState('')

  async function toggleRecording() {
    setVoiceError('')

    if (!recording) {
      try {
        recorderRef.current = await startRecording()
        setRecording(true)
      } catch {
        setVoiceError('No se pudo acceder al micrófono. Escribe la tarea.')
      }
      return
    }

    setRecording(false)
    setBusy(true)
    try {
      const wavBase64 = await recorderRef.current.stop()
      const active = resolveModel(settings)
      if (!active.apiKey) throw new Error('sin clave')
      const fields = await parseTaskFromAudio({
        provider: active.provider,
        apiKey: active.apiKey,
        model: active.model,
        wavBase64,
        today: toDateKey(),
      })
      if (!fields.title) throw new Error('sin transcripción')
      onCreate({ ...fields, source: 'voice' })
    } catch {
      // Nada se pierde: la persona puede escribir la tarea a continuación.
      setVoiceError('No se pudo interpretar el audio. Escribe la tarea.')
    } finally {
      recorderRef.current = null
      setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return

    setBusy(true)
    const today = toDateKey()
    const active = resolveModel(settings)

    let fields
    if (active.apiKey) {
      try {
        fields = await parseTask({
          provider: active.provider,
          apiKey: active.apiKey,
          model: active.model,
          input: text,
          today,
        })
      } catch {
        fields = null
      }
    }
    // Sin API key o ante cualquier fallo, la tarea se crea igual con el texto tal cual.
    onCreate({ ...(fields || { title: text, dueDate: today }), source: 'text' })

    setInput('')
    setBusy(false)
  }

  return (
    <div>
      <form onSubmit={submit} className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <Icon name="sparkles" className="h-5 w-5 shrink-0 text-accent-soft" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe una tarea: «mañana terminar el informe de redes, alta prioridad, 2 horas»"
          aria-label="Nueva tarea"
          className="min-w-0 flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy && !recording}
          aria-label={recording ? 'Detener grabación' : 'Dictar tarea'}
          className={`rounded-xl p-2 transition-colors ${
            recording ? 'bg-status-bad/20 text-status-bad' : 'text-white/50 hover:bg-white/5 hover:text-white/90'
          }`}
        >
          <Icon name="mic" className="h-4 w-4" />
        </button>
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
        >
          {busy ? 'Interpretando…' : 'Agregar'}
        </button>
      </form>
      {voiceError && <p className="px-1 pt-1 text-xs text-status-bad">{voiceError}</p>}
    </div>
  )
}
