<script setup>
import { computed } from 'vue'
import CodeBlock from './CodeBlock.vue'
import { looksLikeScript, tryJson, refLabel, parseQuery } from '../lib/model.js'
import { isSysId } from '../lib/xml.js'

const props = defineProps({
  name: { type: String, default: '' },
  value: { type: [String, Number, Boolean], default: '' },
  model: { type: Object, required: true }
})
const emit = defineEmits(['open'])

const raw = computed(() => (props.value == null ? '' : String(props.value)))
const json = computed(() => tryJson(raw.value))
const isScript = computed(() => looksLikeScript(props.name, raw.value))
const ref_ = computed(() => (isSysId(raw.value) ? refLabel(raw.value, props.model) : null))
const isLong = computed(() => raw.value.length > 160 || raw.value.includes('\n'))
const query = computed(() => (isScript.value || json.value ? null : parseQuery(raw.value)))

// Divide el texto en trozos normales y pills de datos {{...}}
function pills(text) {
  return String(text).split(/(\{\{[^}]*\}\})/g).filter((s) => s !== '').map((s) => ({
    text: s,
    pill: s.startsWith('{{') && s.endsWith('}}')
  }))
}
const chunks = computed(() => pills(raw.value))
</script>

<template>
  <CodeBlock v-if="isScript" :code="raw" :label="name || 'script'" />
  <CodeBlock v-else-if="json" :code="JSON.stringify(json, null, 2)" :label="(name || 'valor') + ' · JSON'" />
  <ul v-else-if="query" class="query">
    <li v-for="(c, i) in query" :key="i">
      <span v-if="c.join" class="join">{{ c.join === 'OR' ? 'o' : 'y también' }}</span>
      <span class="qfield">{{ c.field }}</span>
      <span class="qop">{{ c.op }}</span>
      <span class="qval">
        <template v-for="(p, k) in pills(c.value)" :key="k">
          <span v-if="p.pill" class="pill-data">{{ p.text }}</span>
          <span v-else>{{ p.text }}</span>
        </template>
      </span>
    </li>
  </ul>
  <div v-else-if="ref_" class="ref" @click="emit('open', ref_.record)">
    <span class="chip">{{ ref_.table }}</span>
    <span class="link">{{ ref_.label }}</span>
  </div>
  <span v-else-if="isSysId(raw)" class="sysid" :title="raw">{{ raw }} <em class="muted">(no incluido en el XML)</em></span>
  <pre v-else-if="isLong" class="longtext">{{ raw }}</pre>
  <span v-else class="inline">
    <template v-for="(c, i) in chunks" :key="i">
      <span v-if="c.pill" class="pill-data">{{ c.text }}</span>
      <span v-else>{{ c.text }}</span>
    </template>
  </span>
</template>

<style scoped>
.ref { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.ref .link { color: var(--accent); text-decoration: underline dotted; }
.sysid { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.longtext { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; }
.inline { word-break: break-word; }

/* una condición por línea, con el campo y el operador alineados */
.query { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }
.query li {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  gap: 4px 8px;
  align-items: baseline;
  padding: 3px 8px;
  border-left: 2px solid var(--line);
  background: var(--bg-3);
  border-radius: 0 4px 4px 0;
}
.query .join {
  grid-column: 1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted);
}
.query li > .qfield { grid-column: 2; }
.qfield { font-family: ui-monospace, monospace; font-size: 12px; color: var(--accent); }
.qop { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.qval { word-break: break-word; }

/* en una tarjeta angosta la condición se apila en vez de partir cada palabra */
@container (max-width: 420px) {
  .query li { grid-template-columns: 1fr; }
  .query li > .qfield, .query .join { grid-column: 1; }
  .qop { justify-self: start; }
}
</style>
