<script setup>
import { ref, computed } from 'vue'
import ValueCell from './ValueCell.vue'
import { visibleFields } from '../lib/model.js'

const props = defineProps({ record: Object, model: Object })
const emit = defineEmits(['open'])
const showSystem = ref(false)
const fields = computed(() => visibleFields(props.record, showSystem.value))
</script>

<template>
  <div>
    <label class="toggle">
      <input type="checkbox" v-model="showSystem" />
      Mostrar campos de sistema
    </label>
    <table>
      <tbody>
        <tr v-for="f in fields" :key="f.name">
          <th>{{ f.name }}</th>
          <td><ValueCell :name="f.name" :value="f.value" :model="model" @open="emit('open', $event)" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.toggle { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; vertical-align: top; width: 210px; padding: 7px 12px 7px 0;
  font-weight: 500; color: var(--muted); font-size: 12.5px; font-family: ui-monospace, monospace;
}
td { padding: 7px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
tr:last-child td { border-bottom: none; }
</style>
