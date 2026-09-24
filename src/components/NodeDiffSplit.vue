<script setup>
import { computed } from 'vue'
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
const blocks = computed(() => {
  const out = []
  let skipped = 0
  for (const row of props.rows) {
    if (props.onlyChanges && (row.status === 'equal' || row.status === 'moved')) { skipped++; continue }
    if (skipped) { out.push({ gap: skipped }); skipped = 0 }
    out.push({ row })
  }
  if (skipped) out.push({ gap: skipped })
  return out
})

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
      <div v-if="b.gap" class="gap muted">
        {{ b.gap }} paso{{ b.gap > 1 ? 's' : '' }} sin cambios
      </div>
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
  font-size: 11px; text-align: center; padding: 5px 0; margin: 3px 0;
  border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line);
}
.empty { grid-column: 1 / -1; padding: 16px; border: 1px dashed var(--line); border-radius: 10px; }
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
</style>
