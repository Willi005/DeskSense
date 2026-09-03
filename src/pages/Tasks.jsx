import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import TaskComposer from '../components/TaskComposer'
import TaskItem from '../components/TaskItem'
import TaskFormDialog from '../components/TaskFormDialog'
import { useTasks } from '../context/TasksContext'
import { completionRate, dayRange, tasksInRange, toDateKey } from '../lib/tasks'

export default function Tasks() {
  const { tasks, addTask, updateTask, toggleDone, removeTask } = useTasks()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const today = useMemo(() => {
    const range = dayRange()
    return { range, key: toDateKey() }
  }, [])

  const groups = useMemo(() => {
    const todays = tasksInRange(tasks, today.range)
    const todayIds = new Set(todays.map((t) => t.id))
    return {
      today: todays,
      undated: tasks.filter((t) => !t.dueDate),
      others: tasks.filter((t) => t.dueDate && !todayIds.has(t.id)),
    }
  }, [tasks, today.range])

  const rate = completionRate(groups.today)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tareas"
        subtitle={`Hoy ${today.key} · ${rate.done} de ${rate.total} completadas (${rate.percent} %)`}
      />

      <TaskComposer onCreate={addTask} />

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-white/50 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
        >
          Agregar sin asistente
        </button>
      </div>

      {[
        { label: 'Hoy', items: groups.today },
        { label: 'Otras fechas', items: groups.others },
        { label: 'Sin fecha', items: groups.undated },
      ].map((group) =>
        group.items.length ? (
          <section key={group.label} className="space-y-2">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-white/40">
              {group.label}
            </h2>
            <ul className="space-y-2">
              {group.items.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={toggleDone}
                  onEdit={setEditing}
                  onRemove={removeTask}
                />
              ))}
            </ul>
          </section>
        ) : null
      )}

      {!tasks.length && (
        <p className="glass rounded-2xl px-5 py-8 text-center text-sm text-white/45">
          Todavía no hay tareas. Describe una arriba y el asistente la ordenará por ti.
        </p>
      )}

      {(editing || creating) && (
        <TaskFormDialog
          task={editing}
          onSave={(fields) => {
            if (editing) updateTask(editing.id, fields)
            else addTask({ ...fields, source: 'form' })
            setEditing(null)
            setCreating(false)
          }}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
