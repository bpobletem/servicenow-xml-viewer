<script setup>
import { computed } from 'vue'
import CodeBlock from './CodeBlock.vue'
import { looksLikeScript, tryJson, refLabel } from '../lib/model.js'
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

// Divide el texto en trozos normales y pills de datos {{...}}
const chunks = computed(() =>
  raw.value.split(/(\{\{[^}]*\}\})/g).filter((s) => s !== '').map((s) => ({
    text: s,
    pill: s.startsWith('{{') && s.endsWith('}}')
  }))
)
</script>

<template>
  <CodeBlock v-if="isScript" :code="raw" :label="name || 'script'" />
  <CodeBlock v-else-if="json" :code="JSON.stringify(json, null, 2)" :label="(name || 'valor') + ' · JSON'" />
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
</style>
