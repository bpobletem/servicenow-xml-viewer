import { extractDocument, isSysId } from './xml.js'
import { tableInfo } from './tables.js'

const SYSTEM_FIELDS = new Set([
  'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on',
  'sys_mod_count', 'sys_domain', 'sys_domain_path', 'sys_package', 'sys_scope',
  'sys_policy', 'sys_replace_on_upgrade', 'sys_class_name', 'sys_update_name',
  'sys_customer_update', 'sys_name', 'sys_tags'
])

// Tablas de metadatos (etiquetas, choices, traducciones): sirven para resolver
// nombres pero no tiene sentido listarlas ni compararlas como registros sueltos.
const METADATA_TABLES = new Set([
  'sys_documentation', 'sys_translated_text', 'sys_choice', 'sys_complex_object',
  'sys_element_mapping'
])

const NODE_TABLES = ['sys_hub_action_instance', 'sys_hub_flow_logic', 'sys_hub_flow_block']

export function buildModel(text) {
  const doc = extractDocument(text)
  const records = doc.records.map((r, i) => ({ ...r, id: 'r' + i, info: tableInfo(r.table) }))

  const bySysId = new Map()
  for (const r of records) if (r.sysId && !bySysId.has(r.sysId)) bySysId.set(r.sysId, r)

  // índice de referencias: sys_id -> registros que lo apuntan
  const refs = new Map()
  for (const r of records) {
    for (const [field, value] of Object.entries(r.fields)) {
      if (field === 'sys_id' || !isSysId(value)) continue
      const key = value.trim()
      if (!refs.has(key)) refs.set(key, [])
      refs.get(key).push({ record: r, field })
    }
  }

  const model = { records, bySysId, refs }

  const roots = pickRoots(records).map((r) => decorate(r, model))

  // los registros que no cuelgan de ningún root visible se listan aparte
  const rootIds = new Set(roots.map((r) => r.id))
  const claimed = new Set()
  for (const root of roots) for (const id of root.consumedIds) claimed.add(id)
  const orphans = records.filter(
    (r) => !rootIds.has(r.id) && !claimed.has(r.id) && !METADATA_TABLES.has(r.table)
  )

  const updateSet = buildUpdateSet(doc, records, roots)

  // lo que ya se lista como entrada del update set no vuelve a aparecer como suelto
  if (updateSet && !updateSet.entriesMissing) {
    const listed = new Set(updateSet.entries.map((e) => e.recordId).filter(Boolean))
    return { ...model, roots, orphans: orphans.filter((r) => !listed.has(r.id)), updateSet }
  }

  return { ...model, roots, orphans, updateSet }
}

/**
 * Un update set es una lista de registros tocados. Cada <sys_update_xml> aporta el
 * "qué, quién y cuándo" y su payload aporta el registro en sí; aquí se vuelven a juntar
 * para poder listar el update set completo y abrir cualquier entrada con su vista normal.
 */
function buildUpdateSet(doc, records, roots) {
  if (!doc.entries.length && !doc.set) return null

  const rootById = new Map(roots.map((r) => [r.id, r]))
  const entries = doc.entries.map((entry) => {
    const own = entry.recordIndexes.map((i) => records[i]).filter(Boolean)
    const main = own.find((r) => r.primary) || own[0] || null
    const root = main ? rootById.get(main.id) || null : null
    const target = root || main
    return {
      ...entry,
      record: main,
      root,
      recordId: main ? main.id : '',
      table: entry.table || (main ? main.table : ''),
      title: entry.targetName || (target ? displayName(target) : entry.name),
      info: tableInfo(entry.table || (main ? main.table : '')),
      view: root ? root.view : 'generic',
      // cuántos registros relacionados viajaron con el principal: da una idea de si el
      // export trae la action completa o sólo su cabecera
      relatedCount: Math.max(own.length - 1, 0),
      detail: root && root.view === 'action' ? root.stepCount + ' steps'
        : root && root.view === 'flow' ? root.nodeCount + ' acciones'
        : ''
    }
  })

  const setFields = (doc.set && doc.set.fields) || {}
  return {
    record: doc.set,
    // Un export hecho con "Export > XML" sobre la fila del update set trae la cabecera y
    // nada más. Es un error fácil de cometer y el síntoma (una pantalla casi vacía) no
    // explica nada por sí solo, así que lo detectamos para poder decirlo.
    entriesMissing: !doc.entries.length,
    name: setFields.name || '',
    description: setFields.description || '',
    state: setFields.state || '',
    application: setFields.application || '',
    createdBy: setFields.sys_created_by || '',
    createdOn: setFields.sys_created_on || '',
    entries
  }
}

/**
 * Elige los registros que se muestran como entrada principal.
 * En un export real cada bloque <record_update table="x"> trae un registro principal
 * y decenas de registros relacionados; sin esto un solo XML produciría cientos de
 * entradas y la comparación terminaría mostrando cualquier registro suelto.
 */
function pickRoots(records) {
  const primary = records.filter((r) => r.primary)
  if (primary.length) {
    const notChild = primary.filter((r) => r.info.kind !== 'child')
    return notChild.length ? notChild : primary
  }
  return records.filter((r) => r.info.kind !== 'child')
}

/**
 * Absorbe de forma transitiva todo lo que referencia a los registros ya consumidos
 * (mappings, condiciones, snapshots, traducciones…) para que no queden sueltos.
 * Nunca absorbe otro registro principal.
 */
function expandConsumed(consumed, model) {
  const ids = new Set()
  for (const r of model.records) if (consumed.has(r.id) && r.sysId) ids.add(r.sysId)
  let changed = true
  while (changed) {
    changed = false
    for (const r of model.records) {
      if (consumed.has(r.id) || r.primary) continue
      for (const [field, value] of Object.entries(r.fields)) {
        if (field === 'sys_id' || !isSysId(value) || !ids.has(value.trim())) continue
        consumed.add(r.id)
        if (r.sysId) ids.add(r.sysId)
        changed = true
        break
      }
    }
  }
}

function decorate(record, model) {
  const base = {
    ...record,
    // una entrada sin payload (un DELETE, o un payload roto) sólo conoce su target_name
    title: record.placeholder ? (record.source.targetName || displayName(record)) : displayName(record),
    consumedIds: [record.id]
  }
  if (record.placeholder) return { ...base, ...genericView(record) }
  if (record.table === 'sys_hub_flow') return buildFlow(base, model)
  if (record.table.startsWith('sys_hub_action_type')) return buildAction(base, model)
  return { ...base, view: 'generic' }
}

/**
 * Cómo se presenta un registro cuando no tiene vista propia. Vive aquí (y no en el
 * componente) para que abrirlo desde la lista del update set y abrirlo desde el modelo
 * den exactamente el mismo título y la misma etiqueta.
 */
export function genericView(record) {
  const info = tableInfo(record.table)
  const deleted = record.placeholder && record.action === 'DELETE'
  return {
    view: 'generic',
    info,
    title: record.placeholder
      ? (record.source.targetName || record.fields.target_name || displayName(record))
      : displayName(record),
    kindLabel: deleted ? 'Eliminado' : info.label,
    deleted
  }
}

/* ---------------------------------------------------------------- helpers */

export function displayName(r) {
  const f = r.fields || {}
  return (
    f.label || f.name || f.sys_name || f.column_label || f.element ||
    f.short_description || f.title || (r.table + ' · ' + (r.sysId || '').slice(0, 8))
  )
}

export function visibleFields(record, showSystem = false) {
  return Object.entries(record.fields)
    .filter(([k, v]) => (showSystem || !SYSTEM_FIELDS.has(k)) && String(v).trim() !== '')
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, value]) => ({ name, value }))
}

const FIELD_ORDER = ['name', 'label', 'short_description', 'description', 'type', 'table', 'active', 'order', 'sys_id']
function rank(name) {
  const i = FIELD_ORDER.indexOf(name)
  return i === -1 ? 50 : i
}

export function looksLikeScript(name, value) {
  if (typeof value !== 'string') return false
  if (value.length < 40) return false
  if (/script|code|source|template/i.test(name) && value.includes('\n')) return true
  return /\n/.test(value) && /(function\s|=>|var\s|let\s|const\s|gs\.|current\.|if\s*\()/.test(value)
}

export function tryJson(value) {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try {
    const parsed = JSON.parse(t)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (e) { /* no era JSON */ }
  return null
}

export function refLabel(sysId, model) {
  const r = model.bySysId.get(String(sysId).trim())
  if (!r) return null
  return { record: r, label: displayName(r), table: r.table }
}

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/* -------------------------------------------------------- inputs / values */

// Inputs de un nodo: sys_variable_value apuntando al registro + campo "values" en JSON.
export function inputsFor(record, model) {
  const out = []
  const seen = new Set()

  for (const { record: child } of uniqueRefs(model, record.sysId)) {
    // mapeos de inputs de un step: sys_element_mapping.id -> field / value
    if (child.table === 'sys_element_mapping') {
      if (child.fields.id !== record.sysId) continue
      const name = child.fields.field || child.fields.name || 'mapping'
      if (seen.has(name)) continue
      out.push({ name, value: child.fields.value ?? '', origin: 'sys_element_mapping', record: child })
      seen.add(name)
      continue
    }
    if (child.table !== 'sys_variable_value') continue
    if (child.fields.document_key && child.fields.document_key !== record.sysId) continue
    const varRef = refLabel(child.fields.variable, model)
    const name = varRef
      ? (varRef.record.fields.element || varRef.record.fields.column_label || varRef.label)
      : unresolvedName(child.fields.variable)
    out.push({ name, value: child.fields.value ?? '', origin: 'sys_variable_value', record: child })
    seen.add(name)
  }

  const json = tryJson(record.fields.values || record.fields.inputs || '')
  if (json && !Array.isArray(json)) {
    for (const [name, value] of Object.entries(json)) {
      if (seen.has(name)) continue
      out.push({
        name,
        value: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        origin: 'values',
        record: null
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// La definición de la variable (var_dictionary) vive en el step type y no viaja en
// el export de la action: mostramos un nombre legible en vez del sys_id crudo.
function unresolvedName(id) {
  const v = (id || '').trim()
  if (!v) return 'variable'
  return isSysId(v) ? 'variable · ' + v.slice(0, 8) : v
}

// refs puede repetir un registro si lo apunta por más de un campo.
function uniqueRefs(model, sysId) {
  const out = []
  const seen = new Set()
  for (const entry of model.refs.get(sysId) || []) {
    if (seen.has(entry.record.id)) continue
    seen.add(entry.record.id)
    out.push(entry)
  }
  return out
}

function childrenOf(record, model, tables) {
  return uniqueRefs(model, record.sysId)
    .filter(({ record: r }) => tables.includes(r.table))
    .map(({ record: r }) => r)
}

/* ------------------------------------------------------------------ flows */

function buildFlow(flow, model) {
  const consumed = new Set([flow.id])
  const isSub = (flow.fields.type || '').toLowerCase().includes('subflow')

  const all = model.records.filter(
    (r) => NODE_TABLES.includes(r.table) && (r.fields.flow === flow.sysId || r.fields.parent_flow === flow.sysId)
  )
  const triggers = model.records
    .filter((r) => r.table === 'sys_hub_trigger_instance' && r.fields.flow === flow.sysId)
    .map((r) => {
      consumed.add(r.id)
      return { record: r, title: displayName(r), inputs: collectInputs(r, model, consumed) }
    })

  const nodeMap = new Map()
  for (const r of all) {
    consumed.add(r.id)
    nodeMap.set(r.sysId, makeNode(r, model, consumed))
  }

  const tree = []
  for (const node of nodeMap.values()) {
    const parentId = firstRef(node.record.fields, ['parent', 'parent_instance', 'block', 'flow_block'])
    const parent = parentId && parentId !== flow.sysId ? nodeMap.get(parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else tree.push(node)
  }
  sortTree(tree)

  const inputs = childrenOf(flow, model, ['sys_hub_flow_input'])
  const outputs = childrenOf(flow, model, ['sys_hub_flow_output'])
  for (const r of [...inputs, ...outputs]) consumed.add(r.id)

  expandConsumed(consumed, model)

  const relatedFlow = {}
  for (const r of model.records) {
    if (r.fields.flow === flow.sysId) relatedFlow[r.table] = (relatedFlow[r.table] || 0) + 1
  }

  return {
    ...flow,
    view: 'flow',
    related: relatedFlow,
    kindLabel: isSub ? 'Subflow' : 'Flow',
    triggers,
    tree,
    nodeCount: nodeMap.size,
    flowInputs: inputs.map((r) => ({ record: r, title: displayName(r) })),
    flowOutputs: outputs.map((r) => ({ record: r, title: displayName(r) })),
    consumedIds: [...consumed]
  }
}

function firstRef(fields, names) {
  for (const n of names) {
    const v = (fields[n] || '').trim()
    if (isSysId(v)) return v
  }
  return ''
}

function makeNode(record, model, consumed) {
  const typeRef = refLabel(firstRef(record.fields, ['action_type', 'flow_logic', 'step_type', 'type']), model)
  const inputs = collectInputs(record, model, consumed)
  const logic = record.table === 'sys_hub_flow_logic' || record.table === 'sys_hub_flow_block'
  return {
    record,
    sysId: record.sysId,
    title: displayName(record),
    typeName: typeRef ? typeRef.label : '',
    table: record.table,
    order: num(record.fields.order),
    isLogic: logic,
    inputs,
    children: []
  }
}

function collectInputs(record, model, consumed) {
  const inputs = inputsFor(record, model)
  for (const i of inputs) if (i.record) consumed.add(i.record.id)
  return inputs
}

function sortTree(nodes) {
  nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  for (const n of nodes) sortTree(n.children)
}

/* ---------------------------------------------------------------- actions */

function buildAction(action, model) {
  const consumed = new Set([action.id])

  // Cualquier tabla de steps que apunte a la action (sys_hub_step, sys_hub_step_ext,
  // sys_hub_action_step…) y, como respaldo, los steps sueltos del XML si la action es única.
  let stepRecords = uniqueRefs(model, action.sysId)
    .filter(({ record: r }) => /step/i.test(r.table))
    .map(({ record: r }) => r)

  if (!stepRecords.length) {
    const loose = model.records.filter((r) => /^sys_hub_step/i.test(r.table))
    const actions = model.records.filter((r) => r.table.startsWith('sys_hub_action_type'))
    if (loose.length && actions.length === 1) stepRecords = loose
  }

  const stepMap = new Map()
  for (const r of stepRecords) {
    consumed.add(r.id)
    stepMap.set(r.sysId, makeNode(r, model, consumed))
  }
  const steps = []
  for (const node of stepMap.values()) {
    const parentId = firstRef(node.record.fields, ['parent', 'parent_step', 'block'])
    const parent = parentId ? stepMap.get(parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else steps.push(node)
  }
  sortTree(steps)

  const ios = uniqueRefs(model, action.sysId)
    .filter(({ record: r }) => /input|output/.test(r.table) || r.table === 'var_dictionary')
    .map(({ record: r, field }) => ({ record: r, field }))
  for (const io of ios) consumed.add(io.record.id)

  const inputs = ios.filter((io) => /input/.test(io.record.table) || /input/i.test(io.record.fields.name || ''))
  const outputs = ios.filter((io) => /output/.test(io.record.table) || /output/i.test(io.record.fields.name || ''))
  const other = ios.filter((io) => !inputs.includes(io) && !outputs.includes(io))

  expandConsumed(consumed, model)

  const related = {}
  for (const { record: r } of uniqueRefs(model, action.sysId)) {
    related[r.table] = (related[r.table] || 0) + 1
  }

  return {
    ...action,
    view: 'action',
    related,
    kindLabel: 'Action',
    steps,
    stepCount: stepMap.size,
    actionInputs: inputs.map((io) => io.record),
    actionOutputs: outputs.map((io) => io.record),
    actionVars: other.map((io) => io.record),
    consumedIds: [...consumed]
  }
}
