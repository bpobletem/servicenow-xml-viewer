// Bus simple para "colapsar / expandir todo": el contenedor provee la señal y cada
// sección colapsable la observa. Cada sección conserva su estado individual.
import { ref, watch, inject, provide } from 'vue'

const KEY = Symbol.for('sn-collapse')

export function provideCollapse() {
  const bus = ref(null)
  provide(KEY, bus)
  const send = (open) => { bus.value = { open, n: (bus.value ? bus.value.n : 0) + 1 } }
  return {
    bus,
    collapseAll: () => send(false),
    expandAll: () => send(true)
  }
}

export function useCollapseTarget(initial = true) {
  const show = ref(initial)
  const bus = inject(KEY, null)
  if (bus) watch(bus, (v) => { if (v) show.value = v.open })
  return show
}
