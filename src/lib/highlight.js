// Resaltado de sintaxis sin dependencias.
//
// Devuelve tokens ({ type, text }) en vez de HTML: los componentes los pintan con un
// <span> por token, así que nunca hace falta escapar nada ni usar v-html, y un script
// con "</script>" o comillas raras no puede romper el render.

const KEYWORDS = new Set([
  'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'default', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'this', 'try', 'catch', 'finally', 'throw', 'class',
  'extends', 'super', 'void', 'yield', 'async', 'await'
])

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])

// Nombres que un desarrollador de ServiceNow reconoce de inmediato: marcarlos ayuda a
// leer un script de un step de un vistazo.
const GLOBALS = new Set([
  'gs', 'current', 'previous', 'g_form', 'g_user', 'g_scratchpad', 'inputs', 'outputs',
  'action', 'GlideRecord', 'GlideRecordSecure', 'GlideAggregate', 'GlideDateTime',
  'GlideDate', 'GlideDuration', 'GlideSystem', 'GlideElement', 'GlideFilter',
  'GlideEncrypter', 'GlideSession', 'GlideModal', 'GlideAjax', 'GlideUser',
  'sn_ws', 'sn_fd', 'sn_impex', 'RESTMessageV2', 'SOAPMessageV2', 'JSON', 'Class',
  'global', 'workflow', 'event', 'producer', 'answer', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'Math', 'Date', 'RegExp', 'parseInt', 'parseFloat', 'console'
])

// Un "/" abre una expresión regular sólo en posición de valor. Sin esto, algo como
// .replace(/\//, '') parece el inicio de un comentario y se traga el resto de la línea.
const REGEX_OK_AFTER = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%',
  '<', '>', '~', '^'
])

const MAX = 200000

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r'
const isDigit = (c) => c >= '0' && c <= '9'
const isIdStart = (c) => /[A-Za-z_$]/.test(c)
const isIdPart = (c) => /[\w$]/.test(c)

export function detectLanguage(text) {
  const t = String(text || '').trim()
  if (!t) return 'text'
  if (t.startsWith('<')) return 'xml'
  if ((t.startsWith('{') || t.startsWith('[')) && looksJson(t)) return 'json'
  return 'js'
}

function looksJson(t) {
  try { JSON.parse(t); return true } catch (e) { return false }
}

/** Divide un token de string en trozos, marcando las pills {{...}} de ServiceNow. */
function pushString(out, text) {
  if (!text.includes('{{')) { out.push({ type: 'string', text }); return }
  for (const part of text.split(/(\{\{[^}]*\}\})/g)) {
    if (!part) continue
    out.push({ type: part.startsWith('{{') && part.endsWith('}}') ? 'pill' : 'string', text: part })
  }
}

function readQuoted(src, i) {
  const quote = src[i]
  let j = i + 1
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === quote) { j++; break }
    // una comilla simple o doble sin cerrar no debe comerse el resto del archivo
    if (quote !== '`' && src[j] === '\n') break
    j++
  }
  return j
}

function readRegex(src, i) {
  let j = i + 1
  let inClass = false
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') { j += 2; continue }
    if (c === '\n') return -1
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) { j++; break }
    j++
  }
  while (j < src.length && /[gimsuy]/.test(src[j])) j++
  return j
}

function tokenizeJs(src) {
  const out = []
  let prev = null // último token significativo (sin espacios)
  const push = (type, text) => {
    if (!text) return
    if (type === 'string') pushString(out, text)
    else out.push({ type, text })
    if (type !== 'space') prev = { type, text }
  }

  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]

    if (isSpace(c)) {
      let j = i
      while (j < n && isSpace(src[j])) j++
      out.push({ type: 'plain', text: src.slice(i, j) })
      i = j
      continue
    }

    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i)
      if (j === -1) j = n
      push('comment', src.slice(i, j))
      i = j
      continue
    }

    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2)
      j = j === -1 ? n : j + 2
      push('comment', src.slice(i, j))
      i = j
      continue
    }

    if (c === '/' && (!prev || prev.type === 'keyword' || (prev.type === 'punct' && REGEX_OK_AFTER.has(prev.text)))) {
      const j = readRegex(src, i)
      if (j > 0) { push('regex', src.slice(i, j)); i = j; continue }
    }

    if (c === '"' || c === "'" || c === '`') {
      const j = readQuoted(src, i)
      push('string', src.slice(i, j))
      i = j
      continue
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let j = i
      while (j < n && /[0-9a-fA-FxX._]/.test(src[j])) j++
      push('number', src.slice(i, j))
      i = j
      continue
    }

    if (isIdStart(c)) {
      let j = i
      while (j < n && isIdPart(src[j])) j++
      const word = src.slice(i, j)
      let k = j
      while (k < n && isSpace(src[k])) k++
      const called = src[k] === '('

      let type
      if (KEYWORDS.has(word)) type = 'keyword'
      else if (LITERALS.has(word)) type = 'literal'
      else if (called) type = 'func'
      else if (prev && prev.type === 'punct' && prev.text === '.') type = 'prop'
      else if (GLOBALS.has(word)) type = 'global'
      else type = 'plain'

      push(type, word)
      i = j
      continue
    }

    push('punct', c)
    i++
  }
  return out
}

function tokenizeJson(src) {
  const tokens = tokenizeJs(src)
  // una cadena seguida de ":" es el nombre de una clave, no un valor
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'string') continue
    let j = i + 1
    while (j < tokens.length && tokens[j].type === 'plain' && !tokens[j].text.trim()) j++
    if (tokens[j] && tokens[j].type === 'punct' && tokens[j].text === ':') tokens[i].type = 'key'
  }
  return tokens
}

function tokenizeXml(src) {
  const out = []
  let i = 0
  const n = src.length
  while (i < n) {
    if (src[i] !== '<') {
      const j = src.indexOf('<', i)
      out.push({ type: 'plain', text: src.slice(i, j === -1 ? n : j) })
      i = j === -1 ? n : j
      continue
    }

    if (src.startsWith('<!--', i)) {
      let j = src.indexOf('-->', i)
      j = j === -1 ? n : j + 3
      out.push({ type: 'comment', text: src.slice(i, j) })
      i = j
      continue
    }

    let end = src.indexOf('>', i)
    if (end === -1) end = n - 1
    const tag = src.slice(i, end + 1)
    out.push(...tokenizeTag(tag))
    i = end + 1
  }
  return out
}

function tokenizeTag(tag) {
  const out = []
  // <nombre  o  </nombre  o  <?xml
  const m = /^<([/?!]?)([\w:.-]*)/.exec(tag)
  const head = m ? m[0].length : 1
  out.push({ type: 'punct', text: '<' + (m ? m[1] : '') })
  if (m && m[2]) out.push({ type: 'tag', text: m[2] })

  const rest = tag.slice(head)
  const re = /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')|(\s+)|(.)/g
  let mm
  while ((mm = re.exec(rest))) {
    if (mm[1]) {
      out.push({ type: 'attr', text: mm[1] })
      out.push({ type: 'punct', text: mm[2] })
      pushString(out, mm[3])
    } else if (mm[4]) {
      out.push({ type: 'plain', text: mm[4] })
    } else {
      out.push({ type: 'punct', text: mm[5] })
    }
  }
  return out
}

/** Tokens de un texto completo. Un texto enorme se deja sin colorear para no trabar la vista. */
export function highlight(text, lang) {
  const src = String(text ?? '')
  if (!src) return []
  const language = lang || detectLanguage(src)
  if (src.length > MAX || language === 'text') return [{ type: 'plain', text: src }]
  if (language === 'xml') return tokenizeXml(src)
  if (language === 'json') return tokenizeJson(src)
  return tokenizeJs(src)
}

/**
 * Tokens agrupados por línea. Se tokeniza el texto entero y luego se corta, para que un
 * comentario de bloque o un string multilínea sigan bien coloreados línea a línea —
 * cosa que no ocurriría tokenizando cada línea por separado.
 */
export function highlightLines(text, lang) {
  const lines = [[]]
  for (const token of highlight(text, lang)) {
    const parts = token.text.split('\n')
    parts.forEach((part, k) => {
      if (k > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ type: token.type, text: part })
    })
  }
  return lines
}
