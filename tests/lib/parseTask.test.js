import { describe, it, expect } from 'vitest'
import { parseTaskResponse } from '../../src/lib/ai.js'

const TODAY = '2026-09-02'

describe('parseTaskResponse', () => {
  it('interpreta una respuesta JSON válida', () => {
    const raw = JSON.stringify({
      title: 'Terminar el informe de redes',
      dueDate: '2026-09-03',
      priority: 'high',
      complexity: 'deep',
      estimatedMinutes: 120,
    })
    const fields = parseTaskResponse(raw, TODAY, 'texto original')
    expect(fields.title).toBe('Terminar el informe de redes')
    expect(fields.dueDate).toBe('2026-09-03')
    expect(fields.priority).toBe('high')
    expect(fields.complexity).toBe('deep')
    expect(fields.estimatedMinutes).toBe(120)
  })

  it('tolera que el modelo envuelva el JSON en un bloque de código', () => {
    const raw = '```json\n{"title":"Regar las plantas","priority":"low"}\n```'
    expect(parseTaskResponse(raw, TODAY, 'original').title).toBe('Regar las plantas')
  })

  it('cae al respaldo conservando el texto original si el JSON es inválido', () => {
    const fields = parseTaskResponse('lo siento, no puedo', TODAY, 'comprar café')
    expect(fields.title).toBe('comprar café')
    expect(fields.priority).toBe('medium')
    expect(fields.complexity).toBe('shallow')
    expect(fields.dueDate).toBe(TODAY)
  })

  it('cae al respaldo si el JSON es válido pero no trae título', () => {
    const fields = parseTaskResponse('{"priority":"high"}', TODAY, 'texto original')
    expect(fields.title).toBe('texto original')
  })

  it('descarta una fecha con formato inesperado', () => {
    const raw = '{"title":"X","dueDate":"mañana"}'
    expect(parseTaskResponse(raw, TODAY, 'X').dueDate).toBe(TODAY)
  })

  it('cae al respaldo si el título no es texto, en vez de convertirlo en basura', () => {
    expect(parseTaskResponse('{"title":{"x":1}}', TODAY, 'texto original').title).toBe('texto original')
    expect(parseTaskResponse('{"title":["a","b"]}', TODAY, 'texto original').title).toBe('texto original')
    expect(parseTaskResponse('{"title":42}', TODAY, 'texto original').title).toBe('texto original')
  })
})
