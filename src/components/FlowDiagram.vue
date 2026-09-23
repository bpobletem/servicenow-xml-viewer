<script setup>
import DiagramNode from './DiagramNode.vue'

defineProps({ flow: Object, selected: { type: String, default: '' } })
const emit = defineEmits(['select'])
</script>

<template>
  <div class="diagram">
    <div v-for="t in flow.triggers" :key="t.record.sysId" class="trigger">
      <div class="badge">TRIGGER</div>
      <div class="tname">{{ t.title }}</div>
      <div class="muted small">
        <span v-if="t.record.fields.table">tabla: {{ t.record.fields.table }}</span>
        <span v-if="t.record.fields.condition"> · condición: {{ t.record.fields.condition }}</span>
      </div>
    </div>

    <template v-for="(n, i) in flow.tree" :key="n.sysId || i">
      <div class="arrow">↓</div>
      <DiagramNode :node="n" :index="i + 1" :selected="selected" @select="emit('select', $event)" />
    </template>

    <div v-if="!flow.tree.length" class="muted empty">
      No se encontraron action instances en este XML. Si pegaste solo el registro del flow,
      carga el update set completo para ver los pasos.
    </div>
    <div v-else class="arrow end">■ fin</div>
  </div>
</template>

<style scoped>
.diagram { display: flex; flex-direction: column; gap: 6px; max-width: 720px; }
.trigger {
  border: 1px solid var(--accent-2); border-radius: 10px; padding: 10px 12px;
  background: rgba(126, 224, 192, .08);
}
.badge {
  font-size: 10px; letter-spacing: .1em; color: var(--accent-2); font-weight: 700;
}
.tname { font-weight: 600; margin-top: 2px; }
.small { font-size: 12px; }
.arrow { color: var(--muted); text-align: center; font-size: 13px; }
.arrow.end { margin-top: 6px; font-size: 11px; }
.empty { padding: 14px; border: 1px dashed var(--line); border-radius: 10px; }
</style>
