// Alineación de secuencias (LCS) reutilizada para líneas de texto y para nodos de flow/action.

import { isIgnored } from './ignored.js'
import { carriesInputs } from './model.js'

export function align(a, b, keyFn = (x) => x, { pairMods = false } = {}) {
  const ak = a.map(keyFn)
  const bk = b.map(keyFn)
  const n = ak.length
  const m = bk.length
  let rows

  if (n * m > 2500000) {
    // secuencias enormes: alineación posicional simple para no colgar el navegador
    rows = []
    const max = Math.max(n, m)
    for (let i = 0; i < max; i++) {
      const left = i < n ? a[i] : null
      const right = i < m ? b[i] : null
      if (left && right) rows.push({ type: ak[i] === bk[i] ? 'equal' : 'mod', a: left, b: right })
      else if (left) rows.push({ type: 'del', a: left, b: null })
      else rows.push({ type: 'add', a: null, b: right })
    }
    return rows
  }

  const w = m + 1
  const dp = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = ak[i] === bk[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }

  rows = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ak[i] === bk[j]) {
      rows.push({ type: 'equal', a: a[i], b: b[j] })
      i++; j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      rows.push({ type: 'del', a: a[i], b: null })
      i++
    } else {
      rows.push({ type: 'add', a: null, b: b[j] })
      j++
    }
  }
  while (i < n) rows.push({ type: 'del', a: a[i++], b: null })
  while (j < m) rows.push({ type: 'add', a: null, b: b[j++] })

  return pairMods ? mergeMods(rows) : rows
}

// Empareja bloques contiguos de eliminado/agregado para mostrarlos lado a lado.
function mergeMods(rows) {
  const out = []
  let k = 0
  while (k < rows.length) {
    if (rows[k].type === 'del') {
      const dels = []
      while (k < rows.length && rows[k].type === 'del') dels.push(rows[k++].a)
      const adds = []
      while (k < rows.length && rows[k].type === 'add') adds.push(rows[k++].b)
      const max = Math.max(dels.length, adds.length)
      for (let x = 0; x < max; x++) {
        const l = x < dels.length ? dels[x] : null
        const r = x < adds.length ? adds[x] : null
        out.push({ type: l && r ? 'mod' : l ? 'del' : 'add', a: l, b: r })
      }
    } else {
      out.push(rows[k++])
    }
  }
  return out
}

export function diffLines(left, right) {
  const a = String(left ?? '').split('\n')
  const b = String(right ?? '').split('\n')
  const rows = align(a, b, (s) => s, { pairMods: true })
  let ln = 0
  let rn = 0
  return rows.map((r) => ({
    type: r.type,
    left: r.a,
    right: r.b,
    leftNo: r.a != null ? ++ln : null,
    rightNo: r.b != null ? ++rn : null
  }))
}

/* --------------------------------------------------- comparación de registros */

export const NOISY_FIELDS = new Set([
  'sys_updated_on', 'sys_updated_by', 'sys_created_on', 'sys_created_by',
  'sys_mod_count', 'sys_update_name', 'sys_policy', 'sys_customer_update'
])

const SYS_ID = /^[0-9a-f]{32}$/i

/**
 * ServiceNow regenera identificadores internos al publicar o al mover algo de instancia:
 * el bloque de un paso, un snapshot, una versión. El id cambia y el registro es el mismo,
 * así que contarlo como cambio entierra los cambios de verdad entre decenas de filas.
 *
 * Se reconoce por su forma, no por su nombre: los dos lados son sys_id, ninguno apunta a
 * un registro presente en su propio XML, y el nombre legible que ServiceNow deja en
 * display_value coincide (o no existe en ninguno de los dos).
 */
function isInternalId(name, left, right, a, b, models) {
  if (name === 'sys_id' || !models) return false
  const l = String(left ?? '').trim()
  const r = String(right ?? '').trim()
  if (!SYS_ID.test(l) || !SYS_ID.test(r)) return false

  const dl = a && a.displays && a.displays[name]
  const dr = b && b.displays && b.displays[name]
  // si ServiceNow dice a qué apunta cada lado, eso manda sobre el id
  if (dl || dr) return dl === dr

  const known = (model, id) => !!(model && model.bySysId && model.bySysId.has(id))
  return !known(models.a, l) && !known(models.b, r)
}

export function diffFields(a, b, models) {
  const fa = a ? a.fields : {}
  const fb = b ? b.fields : {}
  const names = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()
  return names.map((name) => {
    const left = fa[name]
    const right = fb[name]
    let status = 'equal'
    if (left === undefined && right !== undefined) status = 'added'
    else if (left !== undefined && right === undefined) status = 'removed'
    else if (String(left) !== String(right)) status = 'changed'
    const noisy = NOISY_FIELDS.has(name) || isIgnored(name) ||
      (status === 'changed' && isInternalId(name, left, right, a, b, models))
    return { name, left, right, status, noisy }
  })
}

export function realChanges(fieldDiff) {
  return fieldDiff.filter((f) => f.status !== 'equal' && !f.noisy)
}

export function nameKey(record) {
  const f = record.fields || {}
  const name = (record.title || f.name || f.label || f.element || f.internal_name || '')
    .toString().trim().toLowerCase()
  return record.table + '|' + name
}

export function pairKey(record) {
  if (record.sysId) return 'id:' + record.sysId
  const f = record.fields || {}
  return 'nm:' + record.table + '|' + (f.name || f.label || f.element || '')
}

/**
 * Empareja por nombre los registros que quedaron sueltos: dos exports de la misma
 * action/flow tomados de instancias distintas no comparten sys_id.
 */
function reconcileByName(pairs) {
  const onlyB = pairs.filter((p) => !p.a && p.b)
  if (!onlyB.length) return pairs
  const index = new Map()
  for (const p of onlyB) {
    const k = nameKey(p.b)
    if (!index.has(k)) index.set(k, [])
    index.get(k).push(p)
  }
  for (const p of pairs) {
    if (!p.a || p.b) continue
    const bucket = index.get(nameKey(p.a))
    if (bucket && bucket.length) {
      const q = bucket.shift()
      p.b = q.b
      p.match = 'name'
      q.dead = true
    }
  }
  return pairs.filter((p) => !p.dead)
}

function statusOf(a, b, models) {
  if (!b) return 'removed'
  if (!a) return 'added'
  return realChanges(diffFields(a, b, models)).length ? 'changed' : 'equal'
}

/**
 * Empareja los registros de dos XML.
 * Devuelve entradas para los registros principales (con el resumen de cambios en sus
 * registros hijos) y para el resto de registros sueltos.
 */
/**
 * Emparejados a mano: un action duplicado no comparte sys_id ni nombre con el original,
 * así que ninguna regla automática los junta. `forced` es { claveEnA: claveEnB }.
 */
function applyForced(pairs, forced) {
  const keys = Object.keys(forced || {})
  if (!keys.length) return pairs
  const loose = new Map()
  for (const p of pairs) {
    if (p.a && !p.b) loose.set('a:' + pairKey(p.a), p)
    else if (p.b && !p.a) loose.set('b:' + pairKey(p.b), p)
  }
  for (const ka of keys) {
    const pa = loose.get('a:' + ka)
    const pb = loose.get('b:' + forced[ka])
    if (!pa || !pb || pa === pb) continue
    pa.b = pb.b
    pa.match = 'manual'
    pb.dead = true
  }
  return pairs.filter((p) => !p.dead)
}

/**
 * Si de cada lado sobra exactamente un registro del mismo tipo, casi siempre son el mismo
 * con otro nombre (una copia, un renombrado). Se emparejan y se dice cómo se emparejaron,
 * que es más útil que mostrarlos como uno borrado y otro nuevo sin relación.
 */
function pairLeftovers(pairs) {
  const onlyA = pairs.filter((p) => p.a && !p.b)
  const onlyB = pairs.filter((p) => p.b && !p.a)
  if (onlyA.length !== 1 || onlyB.length !== 1) return pairs
  if (onlyA[0].a.table !== onlyB[0].b.table) return pairs
  onlyA[0].b = onlyB[0].b
  onlyA[0].match = 'loose'
  onlyB[0].dead = true
  return pairs.filter((p) => !p.dead)
}

export function buildComparison(modelA, modelB, forced = {}) {
  const models = { a: modelA, b: modelB }
  const childrenOf = (model, root) => {
    const ids = new Set(root.consumedIds || [])
    return model.records.filter((r) => ids.has(r.id) && r.id !== root.id)
  }

  const makeEntry = (a, b, group, match = '') => {
    const fieldDiff = diffFields(a, b, models)
    const changes = realChanges(fieldDiff)
    let children = { added: 0, removed: 0, changed: 0, rows: [] }

    if (a && b && a.consumedIds && b.consumedIds) {
      const ca = childrenOf(modelA, a)
      const cb = childrenOf(modelB, b)
      const map = new Map()
      for (const r of ca) map.set(pairKey(r), { a: r, b: null })
      for (const r of cb) {
        const k = pairKey(r)
        if (map.has(k)) map.get(k).b = r
        else map.set(k, { a: null, b: r })
      }
      for (const pair of reconcileByName([...map.values()])) {
        const st = statusOf(pair.a, pair.b, models)
        if (st !== 'equal') children[st === 'added' ? 'added' : st === 'removed' ? 'removed' : 'changed']++
        children.rows.push({ ...pair, status: st })
      }
    }

    const status = !b ? 'removed' : !a ? 'added'
      : (changes.length || children.added || children.removed || children.changed) ? 'changed' : 'equal'

    const ref = a || b
    return {
      key: pairKey(ref),
      group,
      title: ref.title || (ref.fields.name || ref.fields.label || ref.table),
      table: ref.table,
      kindLabel: ref.kindLabel || (ref.info && ref.info.label) || ref.table,
      icon: (ref.info && ref.info.icon) || '📄',
      a, b, status, fieldDiff, match, matchedByName: match === 'name',
      changeCount: changes.length,
      children
    }
  }

  const build = (listA, listB, group) => {
    const map = new Map()
    for (const r of listA) map.set(pairKey(r), { a: r, b: null })
    for (const r of listB) {
      const k = pairKey(r)
      if (map.has(k)) map.get(k).b = r
      else map.set(k, { a: null, b: r })
    }
    let pairs = reconcileByName([...map.values()])
    pairs = applyForced(pairs, forced)
    // el descarte sólo se aplica a los registros principales: entre los sueltos hay
    // demasiados candidatos como para que adivinar sea útil
    if (group === 'main') pairs = pairLeftovers(pairs)
    return pairs.map((p) => makeEntry(p.a, p.b, group, p.match || (p.matchedByName ? 'name' : '')))
  }

  const main = build(modelA.roots, modelB.roots, 'main')
  const others = build(modelA.orphans, modelB.orphans, 'other')

  const rank = { changed: 0, added: 1, removed: 2, equal: 3 }
  const sort = (arr) => arr.sort((x, y) => rank[x.status] - rank[y.status] || x.title.localeCompare(y.title))

  return { main: sort(main), others: sort(others) }
}

/* ------------------------------------------------- comparación de nodos/steps */

export function flattenNodes(item) {
  const out = []
  const walk = (nodes, prefix) => {
    nodes.forEach((n, i) => {
      const number = prefix ? prefix + '.' + (i + 1) : String(i + 1)
      out.push({ ...n, number })
      walk(n.children, number)
    })
  }
  if (item && item.view === 'flow') walk(item.tree || [], '')
  else if (item && item.view === 'action') walk(item.steps || [], '')
  return out
}

const normTitle = (n) => String(n.title || '').trim().toLowerCase()

// Empareja los del/add sobrantes usando otra clave (nombre, tipo, posición).
function reconcileNodeRows(rows, keyFn) {
  const index = new Map()
  for (const r of rows) {
    if (r.type !== 'add') continue
    const k = keyFn(r.b)
    if (k == null) continue
    if (!index.has(k)) index.set(k, [])
    index.get(k).push(r)
  }
  if (!index.size) return rows
  for (const r of rows) {
    if (r.type !== 'del') continue
    const bucket = index.get(keyFn(r.a))
    if (bucket && bucket.length) {
      const q = bucket.shift()
      r.b = q.b
      r.type = 'pair'
      r.matchedByName = true
      q.dead = true
    }
  }
  return rows.filter((r) => !r.dead)
}

export function diffNodes(itemA, itemB, models) {
  const a = flattenNodes(itemA)
  const b = flattenNodes(itemB)
  let rows = align(a, b, (n) => n.sysId || normTitle(n))
  rows = reconcileNodeRows(rows, (n) => normTitle(n) + '|' + (n.typeName || ''))
  rows = reconcileNodeRows(rows, (n) => normTitle(n))
  rows = reconcileNodeRows(rows, (n) => n.number)

  return rows.map((r) => {
    const inputs = diffInputs(r.a, r.b)
    const all = r.a && r.b ? diffFields(r.a.record, r.b.record, models) : []
    // El campo que guarda los inputs no se compara en crudo: junto a los valores lleva una
    // copia de la definición del tipo de paso (etiquetas, opciones, pistas del formulario)
    // que ServiceNow reescribe al actualizar el step type. Los inputs ya se comparan aparte,
    // así que compararlo además sólo produce diferencias que no son del paso.
    const fields = realChanges(all).filter(
      (f) => f.name !== 'sys_id' && !carriesInputs(f.left) && !carriesInputs(f.right)
    )
    // cuántos se dejaron fuera por ser internos, para poder decirlo en pantalla
    const shown = new Set(fields.map((f) => f.name))
    const ignored = all.filter(
      (f) => f.status !== 'equal' && f.name !== 'sys_id' && !shown.has(f.name)
    ).length
    let status
    if (r.a && r.b) {
      const same = !inputs.some((i) => i.status !== 'equal') && !fields.length && r.a.title === r.b.title
      // Borrar un paso renumera todos los que vienen después. Marcarlos como modificados
      // ahogaría el cambio real entre cien filas que no cambiaron por dentro.
      if (same) status = r.a.number === r.b.number ? 'equal' : 'moved'
      else status = 'mod'
    } else {
      status = r.a ? 'del' : 'add'
    }
    return { ...r, status, inputs, fields, ignored, matchedByName: !!r.matchedByName }
  })
}

export function diffInputs(nodeA, nodeB) {
  const listOf = (n) => (n ? n.inputs : [])
  const named = (list) => list.filter((i) => !i.unresolved)
  const anon = (list) => list.filter((i) => i.unresolved)

  const ma = new Map(named(listOf(nodeA)).map((i) => [i.name, String(i.value ?? '')]))
  const mb = new Map(named(listOf(nodeB)).map((i) => [i.name, String(i.value ?? '')]))
  const names = [...new Set([...ma.keys(), ...mb.keys()])].sort()
  const out = names.map((name) => {
    const left = ma.has(name) ? ma.get(name) : undefined
    const right = mb.has(name) ? mb.get(name) : undefined
    let status = 'equal'
    if (left === undefined) status = 'added'
    else if (right === undefined) status = 'removed'
    else if (left !== right) status = 'changed'
    return { name, left, right, status }
  })

  // Los inputs cuya variable no viaja en el XML se identifican por un sys_id que cambia al
  // duplicar el registro. Emparejarlos por nombre los mostraría todos como añadidos y
  // borrados a la vez, así que se emparejan por su orden, que sí se conserva.
  const aa = anon(listOf(nodeA))
  const ab = anon(listOf(nodeB))
  for (let i = 0; i < Math.max(aa.length, ab.length); i++) {
    const l = aa[i] ? String(aa[i].value ?? '') : undefined
    const r = ab[i] ? String(ab[i].value ?? '') : undefined
    let status = 'equal'
    if (l === undefined) status = 'added'
    else if (r === undefined) status = 'removed'
    else if (l !== r) status = 'changed'
    out.push({ name: (aa[i] || ab[i]).name, left: l, right: r, status })
  }
  return out
}
