import { useState, useEffect, useRef } from 'react'
import { PRIORITY_LABELS, COMPLEXITY_LABELS, toDateKey } from '../lib/tasks'

// Mismas clases que `inputCls` de Settings.jsx, para que los controles del
// diálogo no desentonen con el resto de la aplicación.
const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white/90 placeholder-white/30 outline-none transition-colors focus:border-accent/60'

export default function TaskFormDialog({ task, onSave, onClose }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState({
    title: task?.title || '',
    // Al EDITAR se conserva la ausencia de fecha. Poner la de hoy por defecto
    // aquí haría que corregir el título de una tarea sin fecha le asignara una
    // en silencio, cambiando el período al que pertenece sin que nadie lo pida.
    // Al CREAR sí tiene sentido proponer hoy.
    dueDate: task ? task.dueDate || '' : toDateKey(),
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
      dueDate: form.dueDate || null,
      estimatedMinutes: form.estimatedMinutes === '' ? null : Number(form.estimatedMinutes),
      source: 'form',
    })
  }

  // `role="dialog"` con `aria-modal` promete un comportamiento modal: cerrarse
  // con Escape y no dejar que el foco se escape por detrás del overlay. Sin esto
  // los atributos anuncian algo que la interfaz no cumple.
  useEffect(() => {
    const previouslyFocused = document.activeElement

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll(
        'input:not([disabled]), select:not([disabled]), button:not([disabled])'
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Devolver el foco a donde estaba evita que quede perdido al cerrar.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={task ? 'Editar tarea' : 'Nueva tarea'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        ref={dialogRef}
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
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-deep active:scale-[0.99] disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
