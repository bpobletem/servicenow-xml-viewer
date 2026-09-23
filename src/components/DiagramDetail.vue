<script setup>
import { computed } from 'vue'
import ValueCell from './ValueCell.vue'
import FieldTable from './FieldTable.vue'

const props = defineProps({
  node: Object,
  number: { type: String, default: '' },
  model: { type: Object, required: true }
})
const emit = defineEmits(['open', 'close'])

// Los campos que el editor muestra como parte del paso y que no vienen en los inputs.
const extra = computed(() => {
  if (!props.node) return []
  const f = props.node.record.fields
  return ['condition', 'table', 'script', 'run_as', 'wait_for', 'timeout']
    .filter((k) => (f[k] || '').trim() !== '')
    .map((k) => ({ name: k, value: f[k] }))
})
</script>

<template>
  <aside class="panel" :class="node && node.kind">
    <div v-if="!node" class="hint muted">
      Haz click en cualquier paso del diagrama para ver aquí su detalle completo.
    </div>

    <template v-else>
      <header>
        <div class="line">
          <span class="num">{{ number }}</span>
          <span class="kind">{{ node.kindLabel }}</span>
          <button class="ghost tiny" @click="emit('close')">Cerrar</button>
        </div>
        <h4>{{ node.title }}</h4>
        <p v-if="node.typeName" class="muted sub">{{ node.typeName }}</p>
        <code class="table">{{ node.table }}</code>
      </header>

      <section v-if="extra.length">
        <div class="section muted">Configuración</div>
        <div v-for="e in extra" :key="e.name" class="row">
          <span class="k">{{ e.name }}</span>
          <span class="v"><ValueCell :name="e.name" :value="e.value" :model="model" @open="emit('open', $event)" /></span>
        </div>
      </section>

      <section v-if="node.inputs.length">
        <div class="section muted">Inputs ({{ node.inputs.length }})</div>
        <div v-for="i in node.inputs" :key="i.name" class="row">
          <span class="k">{{ i.name }}</span>
          <span class="v"><ValueCell :name="i.name" :value="i.value" :model="model" @open="emit('open', $event)" /></span>
        </div>
      </section>
      <p v-else-if="!extra.length" class="muted">Sin inputs registrados en el XML.</p>

      <section v-if="node.children.length">
        <div class="section muted">Contiene {{ node.children.length }} paso(s)</div>
        <ul class="kids">
          <li v-for="(c, i) in node.children" :key="c.sysId || i" :class="c.kind">{{ c.title }}</li>
        </ul>
      </section>

      <details class="raw">
        <summary>Todos los campos del registro</summary>
        <FieldTable :record="node.record" :model="model" @open="emit('open', $event)" />
      </details>
    </template>
  </aside>
</template>

<style scoped>
.panel {
  container-type: inline-size;
  border: 1px solid var(--line);
  border-top: 3px solid var(--accent);
  border-radius: var(--radius);
  background: var(--bg-2);
  padding: 14px;
  /* el diagrama es largo: el detalle acompaña el scroll en vez de quedarse arriba */
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 140px);
  overflow: auto;
}
.panel.logic { border-top-color: var(--logic); }
.panel.subflow { border-top-color: var(--subflow); }
.hint { font-size: 13px; }

.line { display: flex; gap: 8px; align-items: center; }
.num { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
.kind { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--accent); }
.panel.logic .kind { color: var(--logic); }
.panel.subflow .kind { color: var(--subflow); }
.line .ghost { margin-left: auto; }
.tiny { padding: 2px 8px; font-size: 12px; }
h4 { margin: 6px 0 0; font-size: 15px; }
.sub { margin: 2px 0 0; font-size: 12.5px; }
.table {
  display: inline-block; margin-top: 6px; font-size: 11px;
  color: var(--muted); font-family: ui-monospace, monospace;
}

section { margin-top: 14px; }
.section {
  font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
  padding-bottom: 6px; border-bottom: 1px solid var(--line); margin-bottom: 8px;
}
.row { display: grid; grid-template-columns: minmax(0, 140px) minmax(0, 1fr); gap: 10px; padding: 3px 0; }
.k { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); word-break: break-word; }
.v { min-width: 0; }
@container (max-width: 480px) { .row { grid-template-columns: 1fr; gap: 2px; } }

.kids { margin: 0; padding-left: 16px; font-size: 12.5px; display: grid; gap: 2px; }
.kids li.logic { color: var(--logic); }
.kids li.subflow { color: var(--subflow); }

.raw { margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 10px; }
.raw summary { cursor: pointer; font-size: 12px; color: var(--muted); }
</style>
