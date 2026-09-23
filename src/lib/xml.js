// Parseo de XML de ServiceNow: update sets completos, registros sueltos y exports "Export > XML".

const SYS_ID_RE = /^[0-9a-f]{32}$/i

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

function walk(node, ctx, out) {
  for (const el of Array.from(node.children)) {
    const tag = el.tagName
    if (tag === 'sys_update_xml') {
      const meta = fieldsOf(el)
      const ctx2 = {
        updateName: meta.name || '',
        updateType: meta.type || '',
        targetName: meta.target_name || '',
        updateSet: meta.update_set || ''
      }
      const payloadEl = Array.from(el.children).find((c) => c.tagName === 'payload')
      const payloadText = payloadEl ? payloadEl.textContent.trim() : ''
      let parsed = false
      if (payloadText && payloadText.startsWith('<')) {
        for (const candidate of [payloadText, '<payload_root>' + payloadText + '</payload_root>']) {
          try {
            walkRoot(parseXmlDoc(candidate), ctx2, out)
            parsed = true
            break
          } catch (e) { /* probamos envolviendo en una raíz sintética */ }
        }
      }
      if (!parsed) {
        // payload vacío o borrado: dejamos constancia del registro del update set
        out.push({
          table: 'sys_update_xml',
          action: meta.action || '',
          fields: meta,
          sysId: meta.sys_id || '',
          primary: true,
          source: ctx2
        })
      }
    } else if (tag === 'record_update' || tag === 'unload' || tag === 'records' || tag === 'payload_root') {
      walk(el, ctxFor(el, ctx), out)
    } else if (isRecordElement(el)) {
      out.push(makeRecord(el, ctx))
    } else {
      walk(el, ctx, out)
    }
  }
}

function walkRoot(doc, ctx, out) {
  const root = doc.documentElement
  if (!root) return
  if (isRecordElement(root) && root.tagName !== 'unload' && root.tagName !== 'record_update' && root.tagName !== 'payload_root') {
    out.push(makeRecord(root, ctx))
  } else {
    walk(root, ctxFor(root, ctx), out)
  }
}

/**
 * Un mismo registro puede aparecer más de una vez en un export (por ejemplo una
 * segunda entrada parcial con sólo un par de campos). Los fusionamos en uno solo
 * para no duplicar entradas ni perder campos.
 */
function mergeDuplicates(records) {
  const out = []
  const index = new Map()
  for (const r of records) {
    if (!r.sysId) { out.push(r); continue }
    const key = r.table + '|' + r.sysId
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

export function extractRecords(text) {
  const out = []
  walkRoot(parseXmlDoc(text), {}, out)
  return mergeDuplicates(out)
}

export function isSysId(v) {
  return typeof v === 'string' && SYS_ID_RE.test(v.trim())
}
