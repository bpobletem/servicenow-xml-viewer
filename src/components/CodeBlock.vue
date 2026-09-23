<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ code: String, label: { type: String, default: '' } })
const copied = ref(false)
const collapsed = ref(false)
const lines = computed(() => (props.code || '').split('\n').length)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code || '')
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch (e) { /* clipboard bloqueado */ }
}
</script>

<template>
  <div class="code">
    <div class="bar">
      <span class="muted">{{ label || 'script' }} · {{ lines }} líneas</span>
      <span class="actions">
        <button class="ghost tiny" @click="collapsed = !collapsed">{{ collapsed ? 'Mostrar' : 'Ocultar' }}</button>
        <button class="ghost tiny" @click="copy">{{ copied ? 'Copiado' : 'Copiar' }}</button>
      </span>
    </div>
    <pre v-if="!collapsed"><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.code { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #0b0f19; }
.bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 8px; background: var(--bg-3); border-bottom: 1px solid var(--line); font-size: 12px;
}
.actions { display: flex; gap: 6px; }
.tiny { padding: 2px 8px; font-size: 12px; }
pre { margin: 0; padding: 12px; overflow: auto; max-height: 460px; font-size: 12.5px; line-height: 1.55; }
</style>
