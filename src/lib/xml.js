// Parseo de XML de ServiceNow: update sets completos, registros sueltos y exports "Export > XML".

const SYS_ID_RE = /^[0-9a-f]{32}$/i

// El registro que describe el update set en sí, no uno de los que toca.
const SET_TABLES = new Set(['sys_remote_update_set', 'sys_update_set'])

export function parseXmlDoc(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const err = doc.getElementsByTagName('parsererror')[0]
  if (err) {
    const msg = err.textContent.trim().split('\n').filter(Boolean).slice(0, 2).join(' — ')
    throw new Error('XML inválido: ' + msg)
  }
  return doc
}

function fieldsOf(el) {
  const fields = {}
  for (const child of Array.from(el.children)) {
    if (child.children.length) continue
    fields[child.tagName] = child.textContent ?? ''
  }
  return fields
}

/**
 * Los campos de referencia llevan el nombre legible en display_value. Para los nodos de
 * un flow eso es lo único que identifica el tipo de acción ("Update Record", "If"): el
 * registro apuntado pertenece al step type y no viaja en el export.
 */
function displaysOf(el) {
  const out = {}
  for (const child of Array.from(el.children)) {
    if (child.children.length) continue
    const dv = child.getAttribute('display_value')
    if (dv) out[child.tagName] = dv
  }
  return out
}

// Un elemento "registro" es una tabla: todos sus hijos son campos hoja.
function isRecordElement(el) {
  if (!el.children.length) return false
  return Array.from(el.children).every((c) => c.children.length === 0)
}

function makeRecord(el, ctx) {
  const fields = fieldsOf(el)
  const { primaryTable, ...source } = ctx
  return {
    table: el.tagName,
    action: el.getAttribute('action') || '',
    fields,
    displays: displaysOf(el),
    sysId: fields.sys_id || '',
    // el <record_update table="x"> marca cuál es el registro principal del bloque;
    // el resto son registros relacionados que viajan con él.
    primary: !!primaryTable && primaryTable === el.tagName,
    source
  }
}

// <record_update table="x"> define el registro principal del bloque.
function ctxFor(el, ctx) {
  const table = el.getAttribute && el.getAttribute('table')
  return table ? { ...ctx, primaryTable: table } : ctx
}

/**
 * Cada <sys_update_xml> es una entrada del update set: un registro que se tocó, con
 * quién y cuándo lo hizo y si fue alta, modificación o borrado. Esa información sólo
 * existe en el wrapper — dentro del payload no queda rastro — así que la guardamos
 * aparte en vez de descartarla al desenvolver el payload.
 */
function makeEntry(meta, index) {
  return {
    id: 'e' + index,
    action: meta.action || '',
    name: meta.name || '',
    targetName: meta.target_name || '',
    table: meta.table || '',
    type: meta.type || '',
    category: meta.category || '',
    updateSet: meta.update_set || '',
    createdBy: meta.sys_created_by || '',
    createdOn: meta.sys_created_on || '',
    updatedBy: meta.sys_updated_by || meta.sys_created_by || '',
    updatedOn: meta.sys_updated_on || meta.sys_created_on || '',
    sysId: meta.sys_id || '',
    hasPayload: false,
    recordIndexes: []
  }
}

function walk(node, ctx, out) {
  for (const el of Array.from(node.children)) {
    const tag = el.tagName

    if (tag === 'sys_update_xml') {
      const meta = fieldsOf(el)
      const entry = makeEntry(meta, out.entries.length)
      out.entries.push(entry)

      const ctx2 = {
        entryId: entry.id,
        updateName: entry.name,
        updateType: entry.type,
        targetName: entry.targetName,
        updateSet: entry.updateSet
      }
      const payloadEl = Array.from(el.children).find((c) => c.tagName === 'payload')
      const payloadText = payloadEl ? payloadEl.textContent.trim() : ''
      const before = out.records.length

      if (payloadText && payloadText.startsWith('<')) {
        for (const candidate of [payloadText, '<payload_root>' + payloadText + '</payload_root>']) {
          try {
            walkRoot(parseXmlDoc(candidate), ctx2, out)
            entry.hasPayload = true
            break
          } catch (e) { /* probamos envolviendo en una raíz sintética */ }
        }
      }

      if (entry.hasPayload) {
        for (let i = before; i < out.records.length; i++) entry.recordIndexes.push(i)
      } else {
        // Un DELETE no lleva payload, y un payload roto tampoco: la entrada sigue siendo
        // parte de lo que el update set tocó, así que la representamos igual.
        out.records.push({
          table: entry.table || 'sys_update_xml',
          action: entry.action,
          fields: meta,
          sysId: '',
          primary: true,
          placeholder: true,
          source: ctx2
        })
        entry.recordIndexes.push(out.records.length - 1)
      }
      continue
    }

    if (tag === 'record_update' || tag === 'unload' || tag === 'records' || tag === 'payload_root') {
      walk(el, ctxFor(el, ctx), out)
    } else if (isRecordElement(el)) {
      const record = makeRecord(el, ctx)
      // el registro del propio update set encabeza la vista, pero también se conserva
      // entre los registros: si el export no trae entradas es lo único que hay que mostrar
      if (SET_TABLES.has(record.table) && !ctx.entryId) out.set = record
      out.records.push(record)
    } else {
      walk(el, ctx, out)
    }
  }
}

function walkRoot(doc, ctx, out) {
  const root = doc.documentElement
  if (!root) return
  if (isRecordElement(root) && root.tagName !== 'unload' && root.tagName !== 'record_update' && root.tagName !== 'payload_root') {
    out.records.push(makeRecord(root, ctx))
  } else {
    walk(root, ctxFor(root, ctx), out)
  }
}

/**
 * Un mismo registro puede aparecer más de una vez dentro de un bloque (por ejemplo una
 * segunda entrada parcial con sólo un par de campos). Los fusionamos para no duplicar
 * entradas ni perder campos.
 *
 * La fusión es por entrada del update set, no global: dos entradas distintas pueden tocar
 * el mismo sys_id en momentos distintos, y mezclarlas produciría un registro que nunca
 * existió y haría desaparecer una de las dos del listado.
 */
function mergeDuplicates(records) {
  const out = []
  const index = new Map()
  for (const r of records) {
    if (!r.sysId) { out.push(r); continue }
    const key = (r.source.entryId || '-') + '|' + r.table + '|' + r.sysId
    const prev = index.get(key)
    if (!prev) {
      index.set(key, r)
      out.push(r)
      continue
    }
    for (const [k, v] of Object.entries(r.fields)) {
      if (String(v).trim() !== '' || !(k in prev.fields)) prev.fields[k] = v
    }
    prev.primary = prev.primary || r.primary
  }
  return out
}

/**
 * Devuelve el documento completo: los registros, las entradas del update set (si el XML
 * es un update set) y el registro que describe el propio update set.
 */
export function extractDocument(text) {
  const out = { records: [], entries: [], set: null }
  walkRoot(parseXmlDoc(text), {}, out)

  const merged = mergeDuplicates(out.records)
  if (merged.length !== out.records.length) {
    // los índices guardados en las entradas apuntan al array previo a la fusión
    const position = new Map()
    merged.forEach((r, i) => position.set(r, i))
    for (const entry of out.entries) {
      entry.recordIndexes = entry.recordIndexes
        .map((i) => position.get(out.records[i]))
        .filter((i) => i !== undefined)
    }
  }
  out.records = merged
  return out
}

export function extractRecords(text) {
  return extractDocument(text).records
}

export function isSysId(v) {
  return typeof v === 'string' && SYS_ID_RE.test(v.trim())
}
