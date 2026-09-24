<script setup>
import { computed, ref, watch } from 'vue'
import SplitDiffRow from './SplitDiffRow.vue'

const props = defineProps({
  rows: { type: Array, required: true },
  model: Object,
  onlyChanges: Boolean
})

/**
 * Esconder los pasos iguales rompe la secuencia y uno pierde de vista dónde está parado.
 * Se reemplazan por una línea que dice cuántos se saltaron, como en un diff de git.
 */
// Tramos desplegados a mano: se identifican por dónde empiezan en la lista original.
const opened = ref(new Set())
watch(() => [props.rows, props.onlyChanges], () => { opened.value = new Set() })

const blocks = computed(() => {
  const out = []
  let run = []
  const flush = () => {
    if (!run.length) return
    if (opened.value.has(run[0].index)) out.push(...run.map((r) => ({ row: r.row })))
    else out.push({ gap: run.length, at: run[0].index })
    run = []
  }
  props.rows.forEach((row, index) => {
    if (props.onlyChanges && (row.status === 'equal' || row.status === 'moved')) {
      run.push({ row, index })
      return
    }
    flush()
    out.push({ row })
  })
  flush()
  return out
})

function reveal(at) {
  const next = new Set(opened.value)
  next.add(at)
  opened.value = next
}

const hasRows = computed(() => blocks.value.some((b) => b.row))

// El número («3.1.2») ya lleva la profundidad: cada punto es un nivel de anidamiento.
function depthOf(row) {
  const n = (row.a || row.b).number
  return Math.min(String(n).split('.').length - 1, 6)
}
</script>

<template>
  <div class="split">
    <template v-for="(b, i) in blocks" :key="i">
      <button v-if="b.gap" class="gap muted" @click="reveal(b.at)">
        {{ b.gap }} paso{{ b.gap > 1 ? 's' : '' }} sin cambios · mostrar
      </button>
      <SplitDiffRow v-else :row="b.row" :depth="depthOf(b.row)" :model="model" />
    </template>

    <div v-if="!hasRows" class="muted empty">
      <template v-if="rows.length">Los pasos son idénticos en ambos XML.</template>
      <template v-else>No se detectaron pasos en estos XML.</template>
    </div>
  </div>
</template>

<style scoped>
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 14px; }
.gap {
  grid-column: 1 / -1;
  width: 100%;
  font-size: 11px; text-align: center; padding: 5px 0; margin: 3px 0;
  border: none;
  border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line);
  border-radius: 0;
  background: none;
  cursor: pointer;
}
.gap:hover { color: var(--accent); border-color: var(--accent); background: none; }
.empty { grid-column: 1 / -1; padding: 16px; border: 1px dashed var(--line); border-radius: 10px; }
/* la vista partida sólo se apila cuando de verdad no cabe */
@media (max-width: 620px) { .split { grid-template-columns: 1fr; } }
</style>
