import { memo } from 'react'
import Icon from './Icon'
import { PRIORITY_LABELS, COMPLEXITY_LABELS } from '../lib/tasks'

const PRIORITY_STYLES = {
  high: 'text-status-bad',
  medium: 'text-status-moderate',
  low: 'text-white/50',
}

function TaskItem({ task, onToggle, onEdit, onRemove }) {
  const done = task.status === 'done'
  return (
    <li className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <button
        onClick={() => onToggle(task.id)}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como completada'}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors ${
          done ? 'bg-status-good/20 ring-status-good/40' : 'ring-white/20 hover:ring-white/40'
        }`}
      >
        {done && <Icon name="check" className="h-4 w-4 text-status-good" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${done ? 'text-white/40 line-through' : 'text-white/90'}`}>
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <span className={PRIORITY_STYLES[task.priority]}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          <span aria-hidden>·</span>
          <span>{COMPLEXITY_LABELS[task.complexity]}</span>
          {task.dueDate && (
            <>
              <span aria-hidden>·</span>
              <span>{task.dueDate}</span>
            </>
          )}
          {task.estimatedMinutes && (
            <>
              <span aria-hidden>·</span>
              <span>{task.estimatedMinutes} min</span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => onEdit(task)}
        aria-label="Editar tarea"
        className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <Icon name="settings" className="h-4 w-4" />
      </button>
      <button
        onClick={() => onRemove(task.id)}
        aria-label="Eliminar tarea"
        className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-status-bad"
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </li>
  )
}

export default memo(TaskItem)
