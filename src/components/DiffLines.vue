<script setup>
import { ref, computed } from 'vue'
import { diffLines } from '../lib/diff.js'

const props = defineProps({
  left: { type: String, default: '' },
  right: { type: String, default: '' },
  label: { type: String, default: '' }
})

const collapsed = ref(false)
const rows = computed(() => diffLines(props.left, props.right))
const stats = computed(() => ({
  add: rows.value.filter((r) => r.type === 'add' || r.type === 'mod').length,
  del: rows.value.filter((r) => r.type === 'del' || r.type === 'mod').length
}))
</script>

<template>
  <div class="dl">
    <div class="bar">
      <span class="muted">{{ label || 'texto' }}</span>
      <span class="right">
        <span class="plus">+{{ stats.add }}</span>
        <span class="minus">−{{ stats.del }}</span>
        <button class="ghost tiny" @click="collapsed = !collapsed">{{ collapsed ? 'Mostrar' : 'Ocultar' }}</button>
      </span>
    </div>
    <div v-if="!collapsed" class="grid">
      <div class="side">
        <div v-for="(r, i) in rows" :key="'l' + i" class="ln" :class="r.type === 'add' ? 'blank' : r.type === 'equal' ? '' : 'del'">
          <span class="no">{{ r.leftNo ?? '' }}</span>
          <code>{{ r.left ?? '' }}</code>
        </div>
      </div>
      <div class="side">
        <div v-for="(r, i) in rows" :key="'r' + i" class="ln" :class="r.type === 'del' ? 'blank' : r.type === 'equal' ? '' : 'add'">
          <span class="no">{{ r.rightNo ?? '' }}</span>
          <code>{{ r.right ?? '' }}</code>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dl { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #0b0f19; }
.bar {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 4px 8px; background: var(--bg-3); border-bottom: 1px solid var(--line); font-size: 12px;
}
.right { display: flex; gap: 8px; align-items: center; }
.plus { color: #7ee0a2; font-family: ui-monospace, monospace; }
.minus { color: var(--danger); font-family: ui-monospace, monospace; }
.tiny { padding: 2px 8px; font-size: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; max-height: 460px; overflow: auto; }
.side { min-width: 0; border-right: 1px solid var(--line); }
.side:last-child { border-right: none; }
.ln { display: grid; grid-template-columns: 38px 1fr; gap: 6px; font-size: 12.5px; line-height: 1.55; }
.ln code { white-space: pre-wrap; word-break: break-word; padding-right: 6px; }
.no { text-align: right; color: #475066; user-select: none; font-family: ui-monospace, monospace; font-size: 11px; padding-top: 1px; }
.add { background: rgba(80, 200, 130, .14); }
.del { background: rgba(255, 120, 120, .13); }
.blank { background: rgba(255, 255, 255, .025); }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
