import { useState } from 'react'
import Icon from './Icon'
import { useSettings } from '../context/SettingsContext'
import { resolveModel } from '../lib/models'
import { parseTask } from '../lib/ai'
import { toDateKey } from '../lib/tasks'

export default function TaskComposer({ onCreate }) {
  const { settings } = useSettings()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

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
        type="submit"
        disabled={!input.trim() || busy}
        className="rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
      >
        {busy ? 'Interpretando…' : 'Agregar'}
      </button>
    </form>
  )
}
