<script setup>
import { ref, computed, shallowRef } from 'vue'
import RecordDetail from './components/RecordDetail.vue'
import RecordDiff from './components/RecordDiff.vue'
import UpdateSetView from './components/UpdateSetView.vue'
import { buildModel, genericView } from './lib/model.js'
import { buildComparison } from './lib/diff.js'
import { SAMPLE_XML, SAMPLE_XML_V2 } from './lib/sample.js'

/* ---------------------------------------------------------------- estado */
const xmlA = ref('')
const xmlB = ref('')
const modelA = shallowRef(null)
const modelB = shallowRef(null)
const nameA = ref('XML A')
const nameB = ref('XML B')
const error = ref('')

const dual = ref(false)          // pantalla inicial con dos paneles
const compareModal = ref(false)  // modal para cargar el segundo XML
const dragging = ref('')

const selectedId = ref('')
const adHoc = shallowRef(null)
const selectedKey = ref('')
const filter = ref('')
const onlyChanges = ref(true)
const showOthers = ref(false)

const comparing = computed(() => !!(modelA.value && modelB.value))

/* --------------------------------------------------------- update set */
// Un update set no es un registro más: es la lista de lo que se tocó. Cuando el XML lo
// trae, esa lista es la pantalla de entrada y cada fila abre la vista normal del registro.
const updateSet = computed(() => (modelA.value ? modelA.value.updateSet : null))
const showSet = ref(false)
const filteredEntries = computed(() =>
  updateSet.value ? matches(updateSet.value.entries, (e) => [e.title, e.table, e.type, e.updatedBy]) : []
)

function openEntry(entry) {
  showSet.value = false
  if (entry.root) { adHoc.value = null; selectedId.value = entry.root.id; return }
  if (entry.record) openRecord(entry.record)
}

/* ------------------------------------------------------------- explorar */
const roots = computed(() => (modelA.value ? modelA.value.roots : []))
const filteredRoots = computed(() => matches(roots.value, (r) => [r.title, r.table]))
const current = computed(() => adHoc.value || roots.value.find((r) => r.id === selectedId.value) || null)

function matches(list, fields) {
  const q = filter.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) => fields(item).some((v) => String(v || '').toLowerCase().includes(q)))
}

/* ------------------------------------------------------------ comparar */
const comparison = computed(() =>
  comparing.value ? buildComparison(modelA.value, modelB.value) : null
)
const cmpMain = computed(() => visibleEntries(comparison.value ? comparison.value.main : []))
const cmpOthers = computed(() => visibleEntries(comparison.value ? comparison.value.others : []))
const cmpCurrent = computed(() => {
  if (!comparison.value) return null
  const all = [...comparison.value.main, ...comparison.value.others]
  return all.find((e) => e.key === selectedKey.value) || cmpMain.value[0] || cmpOthers.value[0] || null
})
const totals = computed(() => {
  if (!comparison.value) return null
  const all = [...comparison.value.main, ...comparison.value.others]
  return {
    changed: all.filter((e) => e.status === 'changed').length,
    added: all.filter((e) => e.status === 'added').length,
    removed: all.filter((e) => e.status === 'removed').length,
    equal: all.filter((e) => e.status === 'equal').length
  }
})

function visibleEntries(list) {
  const base = onlyChanges.value ? list.filter((e) => e.status !== 'equal') : list
  return matches(base, (e) => [e.title, e.table])
}

/* ------------------------------------------------------------- acciones */
function parse(text, which) {
  const model = buildModel(text)
  if (which === 'a') {
    modelA.value = model
    adHoc.value = null
    showSet.value = !!model.updateSet
    selectedId.value = model.roots[0] ? model.roots[0].id : ''
    if (!model.updateSet && !model.roots.length && model.orphans.length) {
      showOthers.value = true
      openRecord(model.orphans[0])
    }
  } else {
    modelB.value = model
  }
  return model
}

function analyze() {
  error.value = ''
  try {
    if (!xmlA.value.trim()) { error.value = 'Falta el XML principal.'; return }
    parse(xmlA.value, 'a')
    if (dual.value && xmlB.value.trim()) parse(xmlB.value, 'b')
    selectedKey.value = ''
  } catch (e) {
    modelA.value = null
    modelB.value = null
    error.value = e.message
  }
}

function compareNow() {
  error.value = ''
  try {
    if (!xmlB.value.trim()) { error.value = 'Pega o sube el XML con el que quieres comparar.'; return }
    parse(xmlB.value, 'b')
    selectedKey.value = ''
    compareModal.value = false
  } catch (e) {
    error.value = e.message
  }
}

function exitCompare() {
  modelB.value = null
  xmlB.value = ''
  nameB.value = 'XML B'
  selectedKey.value = ''
}

function swapSides() {
  const [xa, xb] = [xmlA.value, xmlB.value]
  const [na, nb] = [nameA.value, nameB.value]
  xmlA.value = xb; xmlB.value = xa
  nameA.value = nb; nameB.value = na
  const [ma, mb] = [modelA.value, modelB.value]
  modelA.value = mb; modelB.value = ma
  adHoc.value = null
  selectedId.value = modelA.value.roots[0] ? modelA.value.roots[0].id : ''
}

function openRecord(record) {
  showSet.value = false
  const root = roots.value.find((r) => r.id === record.id)
  if (root) { adHoc.value = null; selectedId.value = root.id; return }
  adHoc.value = { ...record, ...genericView(record) }
}

function select(item) { adHoc.value = null; showSet.value = false; selectedId.value = item.id }

function readFile(file, which) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result)
    if (which === 'a') { xmlA.value = text; nameA.value = file.name }
    else { xmlB.value = text; nameB.value = file.name }
    error.value = ''
    try {
      if (which === 'a') { parse(text, 'a'); selectedKey.value = '' }
      else if (modelA.value) { parse(text, 'b'); selectedKey.value = ''; compareModal.value = false }
    } catch (e) { error.value = e.message }
  }
  reader.readAsText(file)
}

function onDrop(e, which) {
  dragging.value = ''
  const file = e.dataTransfer.files && e.dataTransfer.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (which === 'a') { xmlA.value = String(reader.result); nameA.value = file.name }
    else { xmlB.value = String(reader.result); nameB.value = file.name; dual.value = true }
  }
  reader.readAsText(file)
}

function loadSample() {
  xmlA.value = SAMPLE_XML
  nameA.value = 'ejemplo.xml'
  analyze()
}

function loadSampleB() {
  xmlB.value = SAMPLE_XML_V2
  nameB.value = 'ejemplo-v2.xml'
  compareNow()
}

function reset() {
  xmlA.value = ''; xmlB.value = ''
  modelA.value = null; modelB.value = null
  nameA.value = 'XML A'; nameB.value = 'XML B'
  adHoc.value = null; selectedId.value = ''; selectedKey.value = ''
  error.value = ''; dual.value = false; showSet.value = false
}

const statusDot = { changed: '●', added: '+', removed: '−', equal: '·' }
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <span class="logo">SN</span>
        <div>
          <div class="t">ServiceNow XML Viewer</div>
          <div class="muted s">Update sets y registros → flows y actions legibles</div>
        </div>
      </div>
      <div class="acts">
        <template v-if="comparing">
          <span class="chip">{{ nameA }}</span>
          <span class="muted">vs</span>
          <span class="chip">{{ nameB }}</span>
          <button class="ghost" @click="swapSides">Intercambiar</button>
          <button class="ghost" @click="exitCompare">Salir de comparación</button>
        </template>
        <template v-else>
          <label class="filebtn">
            Subir XML
            <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'a')" />
          </label>
          <button class="ghost" @click="loadSample">Cargar ejemplo</button>
          <button v-if="modelA" class="primary" @click="compareModal = true">Comparar con otro XML</button>
        </template>
        <button v-if="modelA" class="ghost" @click="reset">Limpiar</button>
      </div>
    </header>

    <!-- ------------------------------------------------ pantalla inicial -->
    <main v-if="!modelA" class="intro">
      <div class="introhead">
        <label class="toggle">
          <input type="checkbox" v-model="dual" />
          Cargar dos XML y compararlos de inmediato
        </label>
      </div>

      <div class="panes" :class="{ two: dual }">
        <div
          class="drop"
          :class="{ over: dragging === 'a' }"
          @dragover.prevent="dragging = 'a'"
          @dragleave="dragging = ''"
          @drop.prevent="onDrop($event, 'a')"
        >
          <div class="plabel">
            <span>{{ dual ? 'XML A · versión base' : 'XML' }}</span>
            <label class="filebtn tiny">
              Subir
              <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'a')" />
            </label>
          </div>
          <textarea
            v-model="xmlA"
            spellcheck="false"
            placeholder="Pega aquí el XML: un update set completo (&lt;unload&gt; con varios &lt;sys_update_xml&gt;) o el XML de un solo registro (&lt;record_update&gt;)…"
          ></textarea>
        </div>

        <div
          v-if="dual"
          class="drop"
          :class="{ over: dragging === 'b' }"
          @dragover.prevent="dragging = 'b'"
          @dragleave="dragging = ''"
          @drop.prevent="onDrop($event, 'b')"
        >
          <div class="plabel">
            <span>XML B · versión a comparar</span>
            <label class="filebtn tiny">
              Subir
              <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'b')" />
            </label>
          </div>
          <textarea v-model="xmlB" spellcheck="false" placeholder="Pega aquí el segundo XML…"></textarea>
        </div>
      </div>

      <div class="introacts">
        <button class="primary" :disabled="!xmlA.trim()" @click="analyze">
          {{ dual ? 'Comparar XML' : 'Procesar XML' }}
        </button>
        <span class="muted dhint">o arrastra archivos .xml sobre las zonas de texto</span>
        <span v-if="error" class="err">{{ error }}</span>
      </div>

      <ul class="tips muted">
        <li>Detecta automáticamente si es un update set o un registro suelto.</li>
        <li>Flows y subflows: trigger, acciones en orden, ramas anidadas e inputs de cada una.</li>
        <li>Actions: inputs, outputs y cada step con sus valores; los scripts se muestran completos.</li>
        <li>Comparación lado a lado de dos versiones, con diff línea a línea en los scripts.</li>
        <li>Todo se procesa en tu navegador: no se sube nada a ningún servidor.</li>
      </ul>
    </main>

    <!-- ------------------------------------------------------ resultados -->
    <main v-else class="work">
      <aside>
        <input v-model="filter" class="search" placeholder="Filtrar registros…" />

        <template v-if="comparing">
          <label class="toggle small">
            <input type="checkbox" v-model="onlyChanges" />
            Solo con cambios
          </label>
          <div class="legend muted">
            <span class="changed">● {{ totals.changed }} modificados</span>
            <span class="added">+ {{ totals.added }} nuevos</span>
            <span class="removed">− {{ totals.removed }} eliminados</span>
          </div>
          <ul class="list">
            <li
              v-for="e in cmpMain"
              :key="e.key"
              :class="{ on: cmpCurrent && cmpCurrent.key === e.key }"
              @click="selectedKey = e.key"
            >
              <span class="ic" :class="e.status">{{ statusDot[e.status] }}</span>
              <span class="txt">
                <span class="nm">{{ e.title }}</span>
                <span class="tb muted">
                  {{ e.kindLabel }}
                  <template v-if="e.changeCount"> · {{ e.changeCount }} campos</template>
                  <template v-if="e.children.changed"> · {{ e.children.changed }} hijos</template>
                </span>
              </span>
            </li>
          </ul>
          <div v-if="!cmpMain.length" class="muted pad">Sin registros principales que mostrar.</div>

          <div v-if="cmpOthers.length" class="others">
            <button class="ghost wide" @click="showOthers = !showOthers">
              {{ showOthers ? '▾' : '▸' }} Otros registros ({{ cmpOthers.length }})
            </button>
            <ul v-if="showOthers" class="list small">
              <li
                v-for="e in cmpOthers"
                :key="e.key"
                :class="{ on: cmpCurrent && cmpCurrent.key === e.key }"
                @click="selectedKey = e.key"
              >
                <span class="ic" :class="e.status">{{ statusDot[e.status] }}</span>
                <span class="txt">
                  <span class="nm">{{ e.title }}</span>
                  <span class="tb muted">{{ e.table }}</span>
                </span>
              </li>
            </ul>
          </div>
        </template>

        <template v-else-if="updateSet && !updateSet.entriesMissing">
          <button class="ghost wide setbtn" :class="{ on: showSet }" @click="showSet = true">
            📦 {{ updateSet.name || 'Update set' }}
            <span class="n">{{ updateSet.entries.length }}</span>
          </button>
          <div class="count muted">{{ filteredEntries.length }} de {{ updateSet.entries.length }} registros tocados</div>
          <ul class="list">
            <li
              v-for="e in filteredEntries"
              :key="e.id"
              :class="{ on: !showSet && current && e.recordId === current.id }"
              @click="openEntry(e)"
            >
              <span class="ic">{{ e.info.icon }}</span>
              <span class="txt">
                <span class="nm">{{ e.title }}</span>
                <span class="tb muted">
                  {{ e.type || e.table }}
                  <template v-if="e.detail"> · {{ e.detail }}</template>
                </span>
              </span>
              <span v-if="e.action === 'DELETE'" class="del" title="Eliminado en este update set">−</span>
            </li>
          </ul>
        </template>

        <template v-else>
          <button
            v-if="updateSet"
            class="ghost wide setbtn"
            :class="{ on: showSet }"
            @click="showSet = true"
          >
            📦 {{ updateSet.name || 'Update set' }}
          </button>
          <div class="count muted">{{ filteredRoots.length }} de {{ roots.length }} registros principales</div>
          <ul class="list">
            <li
              v-for="r in filteredRoots"
              :key="r.id"
              :class="{ on: current && current.id === r.id }"
              @click="select(r)"
            >
              <span class="ic">{{ r.info.icon }}</span>
              <span class="txt">
                <span class="nm">{{ r.title }}</span>
                <span class="tb muted">{{ r.kindLabel || r.info.label }}</span>
              </span>
            </li>
          </ul>
          <div v-if="modelA.orphans.length" class="others">
            <button class="ghost wide" @click="showOthers = !showOthers">
              {{ showOthers ? '▾' : '▸' }} Otros registros ({{ modelA.orphans.length }})
            </button>
            <ul v-if="showOthers" class="list small">
              <li
                v-for="r in modelA.orphans"
                :key="r.id"
                :class="{ on: current && current.id === r.id }"
                @click="openRecord(r)"
              >
                <span class="txt">
                  <span class="nm">{{ r.fields.name || r.fields.label || r.sysId.slice(0, 10) }}</span>
                  <span class="tb muted">{{ r.table }}</span>
                </span>
              </li>
            </ul>
          </div>
        </template>
      </aside>

      <section class="pane">
        <RecordDiff
          v-if="comparing && cmpCurrent"
          :entry="cmpCurrent"
          :model-a="modelA"
          :model-b="modelB"
          :label-a="nameA"
          :label-b="nameB"
        />
        <UpdateSetView
          v-else-if="!comparing && showSet && updateSet"
          :set="updateSet"
          @open="openEntry"
        />
        <RecordDetail v-else-if="!comparing && current" :item="current" :model="modelA" @open="openRecord" />
        <div v-else class="muted nothing">Selecciona un registro en la lista.</div>
      </section>
    </main>

    <!-- ----------------------------------------------- modal de comparar -->
    <div v-if="compareModal" class="overlay" @click.self="compareModal = false">
      <div class="modal">
        <h2>Comparar con otro XML</h2>
        <p class="muted">
          Se compara <strong>{{ nameA }}</strong> (A) contra el XML que cargues aquí (B).
        </p>
        <div
          class="drop"
          :class="{ over: dragging === 'b' }"
          @dragover.prevent="dragging = 'b'"
          @dragleave="dragging = ''"
          @drop.prevent="onDrop($event, 'b')"
        >
          <textarea v-model="xmlB" spellcheck="false" placeholder="Pega aquí el segundo XML…"></textarea>
        </div>
        <div class="macts">
          <label class="filebtn">
            Subir archivo
            <input type="file" accept=".xml,text/xml" @change="readFile($event.target.files[0], 'b')" />
          </label>
          <button class="ghost" @click="loadSampleB">Usar ejemplo v2</button>
          <span v-if="error" class="err">{{ error }}</span>
          <span class="spacer"></span>
          <button class="ghost" @click="compareModal = false">Cancelar</button>
          <button class="primary" :disabled="!xmlB.trim()" @click="compareNow">Comparar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.top {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--bg-2);
}
.brand { display: flex; gap: 10px; align-items: center; }
.logo {
  width: 32px; height: 32px; border-radius: 8px; background: var(--accent); color: #06101d;
  display: grid; place-items: center; font-weight: 800; font-size: 13px;
}
.t { font-weight: 600; }
.s { font-size: 12px; }
.acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.filebtn {
  background: var(--bg-3); border: 1px solid var(--line); border-radius: 8px;
  padding: 6px 12px; cursor: pointer; font-size: 14px; white-space: nowrap;
}
.filebtn.tiny { padding: 2px 8px; font-size: 12px; }
.filebtn:hover { border-color: var(--accent); }
.filebtn input { display: none; }

.intro { padding: 24px 20px; max-width: 1100px; width: 100%; margin: 0 auto; overflow: auto; }
.introhead { margin-bottom: 12px; }
.toggle { display: inline-flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); }
.toggle.small { font-size: 12px; margin: 10px 2px 6px; }
.panes { display: grid; grid-template-columns: 1fr; gap: 14px; }
.panes.two { grid-template-columns: 1fr 1fr; }
.drop { border: 1px dashed var(--line); border-radius: 12px; padding: 10px; background: var(--bg-2); }
.drop.over { border-color: var(--accent); background: rgba(98, 182, 255, .08); }
.plabel { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); padding: 0 4px 8px; }
textarea {
  width: 100%; min-height: 300px; resize: vertical; background: #0b0f19; color: var(--text);
  border: 1px solid var(--line); border-radius: 8px; padding: 12px;
  font-family: ui-monospace, monospace; font-size: 12.5px; line-height: 1.5;
}
.introacts { display: flex; gap: 12px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
.dhint { font-size: 12px; }
.err { color: var(--danger); }
.tips { margin-top: 20px; font-size: 13px; line-height: 1.8; }

.work { flex: 1; display: grid; grid-template-columns: 310px 1fr; min-height: 0; }
aside { border-right: 1px solid var(--line); background: var(--bg-2); overflow: auto; padding: 12px; }
.search {
  width: 100%; background: #0b0f19; color: var(--text); border: 1px solid var(--line);
  border-radius: 8px; padding: 7px 10px; font: inherit;
}
.setbtn { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.setbtn.on { border-color: var(--accent); color: var(--accent); }
.setbtn .n { margin-left: auto; background: var(--bg-3); border-radius: 999px; padding: 0 7px; font-size: 11px; }
.list .del { color: var(--danger); font-weight: 700; }
.count { font-size: 11.5px; margin: 8px 2px; }
.legend { display: flex; gap: 10px; font-size: 11px; margin: 0 2px 8px; flex-wrap: wrap; }
.legend .changed { color: var(--logic); }
.legend .added { color: #7ee0a2; }
.legend .removed { color: var(--danger); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.list li {
  display: flex; gap: 8px; align-items: center; padding: 8px 10px;
  border-radius: 8px; cursor: pointer; border: 1px solid transparent;
}
.list li:hover { background: var(--bg-3); }
.list li.on { background: var(--bg-3); border-color: var(--accent); }
.ic { width: 18px; text-align: center; font-family: ui-monospace, monospace; }
.ic.changed { color: var(--logic); }
.ic.added { color: #7ee0a2; }
.ic.removed { color: var(--danger); }
.ic.equal { color: var(--muted); }
.txt { display: flex; flex-direction: column; min-width: 0; }
.nm { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb { font-size: 11px; }
.list.small .nm { font-family: ui-monospace, monospace; font-size: 12px; }
.others { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
.wide { width: 100%; text-align: left; }
.pad { padding: 10px 2px; font-size: 12.5px; }
.pane { min-width: 0; overflow: hidden; }
.nothing { padding: 30px; }

.overlay {
  position: fixed; inset: 0; background: rgba(4, 8, 16, .72);
  display: grid; place-items: center; padding: 20px; z-index: 20;
}
.modal {
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 14px;
  padding: 20px; width: min(820px, 100%);
}
.modal h2 { margin: 0 0 4px; font-size: 17px; }
.modal p { margin: 0 0 12px; font-size: 13px; }
.modal textarea { min-height: 260px; }
.macts { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
.spacer { flex: 1; }
@media (max-width: 900px) {
  .work { grid-template-columns: 1fr; }
  aside { max-height: 240px; }
  .panes.two { grid-template-columns: 1fr; }
}
</style>
