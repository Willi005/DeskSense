import { useState } from 'react'
import { PRIORITY_LABELS, COMPLEXITY_LABELS, toDateKey } from '../lib/tasks'

const FIELD = 'w-full rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/90 outline-none ring-1 ring-white/10 focus:ring-white/25'

export default function TaskFormDialog({ task, onSave, onClose }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    dueDate: task?.dueDate || toDateKey(),
    priority: task?.priority || 'medium',
    complexity: task?.complexity || 'shallow',
    estimatedMinutes: task?.estimatedMinutes ?? '',
  })

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    onSave({
      ...form,
      title: form.title.trim(),
      estimatedMinutes: form.estimatedMinutes === '' ? null : Number(form.estimatedMinutes),
      source: 'form',
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={task ? 'Editar tarea' : 'Nueva tarea'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md space-y-4 rounded-3xl p-6"
      >
        <h2 className="text-lg font-semibold text-white">
          {task ? 'Editar tarea' : 'Nueva tarea'}
        </h2>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Título</span>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            autoFocus
            className={FIELD}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Fecha objetivo</span>
          <input
            type="date"
            value={form.dueDate || ''}
            onChange={(e) => set('dueDate', e.target.value)}
            className={FIELD}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Prioridad</span>
            <select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              className={FIELD}
            >
              {Object.entries(PRIORITY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Complejidad</span>
            <select
              value={form.complexity}
              onChange={(e) => set('complexity', e.target.value)}
              className={FIELD}
            >
              {Object.entries(COMPLEXITY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Minutos estimados (opcional)</span>
          <input
            type="number"
            min="0"
            value={form.estimatedMinutes}
            onChange={(e) => set('estimatedMinutes', e.target.value)}
            className={FIELD}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-white/60 transition-colors hover:text-white/90"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!form.title.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm text-white transition-opacity disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
