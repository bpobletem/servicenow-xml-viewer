<script setup>
import { useCollapseTarget } from '../lib/collapse.js'

const props = defineProps({
  title: String,
  count: { type: [Number, String], default: null },
  open: { type: Boolean, default: true }
})
const show = useCollapseTarget(props.open)
</script>

<template>
  <div class="coll" :class="{ closed: !show }">
    <button class="chead" :aria-expanded="show" @click="show = !show">
      <span class="caret">{{ show ? '▾' : '▸' }}</span>
      <span class="ctitle">{{ title }}</span>
      <span v-if="count !== null && count !== ''" class="cnum">{{ count }}</span>
      <slot name="meta" />
    </button>
    <div v-show="show" class="cbody">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.coll { margin-bottom: 22px; }
.coll.closed { margin-bottom: 10px; }
.chead {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: 0; border-bottom: 1px solid var(--line);
  padding: 0 0 6px; margin-bottom: 10px; cursor: pointer; text-align: left;
}
.chead:hover .ctitle { color: var(--text); }
.caret { font-size: 11px; color: var(--muted); width: 12px; }
.ctitle {
  font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
}
.cnum {
  font-size: 11px; color: var(--muted); background: var(--bg-3);
  border: 1px solid var(--line); border-radius: 999px; padding: 0 7px;
}
.closed .chead { margin-bottom: 0; }
</style>
