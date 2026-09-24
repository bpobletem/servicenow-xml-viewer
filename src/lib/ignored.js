import { ref } from 'vue'

/**
 * Campos que el usuario decidió no contar como cambio.
 *
 * La heurística que detecta identificadores internos acierta en los casos claros, pero
 * cada instancia tiene sus propios campos que cambian sin que cambie nada (`block` es el
 * ejemplo típico). En vez de mantener una lista de nombres que nunca va a estar completa,
 * se deja que quien compara marque el campo y se recuerda para la próxima.
 */
const KEY = 'snxml.ignoredFields'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    // modo privado o almacenamiento bloqueado: se funciona igual, sin recordar nada
    return new Set()
  }
}

export const ignoredFields = ref(load())

function save(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]))
  } catch { /* no poder guardar no debe romper la comparación */ }
}

export function isIgnored(name) {
  return ignoredFields.value.has(name)
}

export function toggleIgnored(name) {
  const next = new Set(ignoredFields.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  ignoredFields.value = next
  save(next)
}

export function clearIgnored() {
  ignoredFields.value = new Set()
  save(ignoredFields.value)
}
