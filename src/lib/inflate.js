// Algunos campos de ServiceNow viajan comprimidos: los inputs de cada nodo de un flow
// (`values`, `subflow_inputs`, `trigger_inputs`) son un JSON en gzip codificado en base64.
// Sin descomprimirlos la vista muestra un bloque ilegible en vez de los datos del paso.

// Cabecera gzip (1f 8b 08) en base64: todo flujo gzip empieza por "H4sI".
const GZIP_B64 = /^H4sI[A-Za-z0-9+/=\s]+$/

export function looksCompressed(value) {
  return typeof value === 'string' && value.length > 32 && GZIP_B64.test(value.trim())
}

async function gunzip(b64) {
  const bin = atob(b64.trim())
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

/**
 * Descomprime in situ todos los campos comprimidos de los registros. Es asíncrono porque
 * DecompressionStream lo es; se hace una sola vez, antes de construir el modelo, para que
 * el resto del código siga trabajando con texto plano.
 */
export async function inflateRecords(records) {
  if (typeof DecompressionStream === 'undefined') return 0
  const jobs = []
  for (const record of records) {
    for (const [name, value] of Object.entries(record.fields)) {
      if (!looksCompressed(value)) continue
      jobs.push(
        gunzip(value)
          .then((text) => { record.fields[name] = text })
          // un campo que no era gzip se deja como estaba: no vale la pena romper la carga
          .catch(() => {})
      )
    }
  }
  await Promise.all(jobs)
  return jobs.length
}
