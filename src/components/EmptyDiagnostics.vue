<script setup>
defineProps({ what: String, diagnostics: Object })
</script>

<template>
  <div class="diag">
    <p class="m0">{{ what }}</p>
    <p class="muted m0">
      El XML trae {{ diagnostics.total }} registro(s). Si esperabas ver contenido aquí, lo más
      probable es que el export no incluya los registros hijos, o que los enlacen por un campo
      que todavía no reconocemos. Esto es lo que hay:
    </p>

    <div class="cols">
      <div>
        <div class="dhead">Registros que apuntan a este registro</div>
        <div v-if="!diagnostics.refs.length" class="muted small">
          Ninguno. El XML no contiene nada que referencie su sys_id.
        </div>
        <div v-for="[key, n] in diagnostics.refs" :key="key" class="drow">
          <code>{{ key }}</code><span>{{ n }}</span>
        </div>
      </div>
      <div>
        <div class="dhead">Tablas presentes en el XML</div>
        <div v-for="[table, n] in diagnostics.tables.slice(0, 14)" :key="table" class="drow">
          <code>{{ table }}</code><span>{{ n }}</span>
        </div>
        <div v-if="diagnostics.tables.length > 14" class="muted small">
          y {{ diagnostics.tables.length - 14 }} tabla(s) más
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diag { border: 1px dashed var(--line); border-radius: 10px; padding: 14px 16px; }
.m0 { margin: 0 0 8px; font-size: 13px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 12px; }
.dhead {
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin-bottom: 6px; border-bottom: 1px solid var(--line); padding-bottom: 4px;
}
.drow { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; padding: 2px 0; }
.drow code { font-size: 12px; word-break: break-all; }
.drow span { color: var(--muted); font-family: ui-monospace, monospace; }
.small { font-size: 12px; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
</style>
