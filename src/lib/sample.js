// Update set de ejemplo (sintético) para probar la herramienta sin datos reales.
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const el = (table, fields) =>
  `<${table} action="INSERT_OR_UPDATE">` +
  Object.entries(fields).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('') +
  `</${table}>`

// Un update entry lleva un solo <record_update> que puede contener el registro
// principal y sus registros relacionados, igual que en un export real.
const rec = (...pairs) => {
  const items = pairs.map(([table, fields]) => el(table, fields))
  return `<record_update table="${pairs[0][0]}">` + items.join('') + '</record_update>'
}

const SET_ID = 'demo0000000000000000000000000000'

const entry = (type, name, target, payload, table, when) =>
  `<sys_update_xml action="INSERT_OR_UPDATE">` +
  `<action>INSERT_OR_UPDATE</action><name>${esc(name)}</name><type>${esc(type)}</type>` +
  `<table>${esc(table)}</table><target_name>${esc(target)}</target_name>` +
  `<sys_created_by>admin</sys_created_by><sys_updated_by>admin</sys_updated_by>` +
  `<sys_updated_on>${esc(when)}</sys_updated_on>` +
  `<update_set display_value="Demo">${SET_ID}</update_set>` +
  `<payload>${esc(payload)}</payload>` +
  `</sys_update_xml>`

const setRecord = (v2) => el('sys_remote_update_set', {
  sys_id: SET_ID,
  name: v2 ? 'Demo — incidentes desde solicitudes (v2)' : 'Demo — incidentes desde solicitudes',
  description: 'Update set de ejemplo: un flow con su trigger y sus acciones, y una action con dos steps.',
  state: 'loaded',
  application: 'Global',
  sys_created_by: 'admin',
  sys_created_on: v2 ? '2026-09-19 09:30:00' : '2026-08-14 12:10:00'
})

const FLOW = 'aaaa0000000000000000000000000001'
const TRIG = 'aaaa0000000000000000000000000002'
const AI1 = 'aaaa0000000000000000000000000003'
const LOGIC = 'aaaa0000000000000000000000000004'
const AI2 = 'aaaa0000000000000000000000000005'
const AI3 = 'aaaa0000000000000000000000000006'
const AI4 = 'aaaa0000000000000000000000000007'
const ACTION = 'bbbb0000000000000000000000000001'
const STEP1 = 'bbbb0000000000000000000000000002'
const STEP2 = 'bbbb0000000000000000000000000003'
const V = (n) => 'cccc00000000000000000000000000' + String(n).padStart(2, '0')

const scriptFor = (v2) => `(function execute(inputs, outputs) {
    var rut = (inputs.rut || '').replace(/[^0-9kK]/g, '');
    if (rut.length < 2) {
        outputs.valido = false;
        return;
    }
    var cuerpo = rut.slice(0, -1);
    var dv = rut.slice(-1).toUpperCase();
    var suma = 0, mult = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo.charAt(i), 10) * mult;
        mult = mult === 7 ? 2 : mult + 1;
    }
    var resto = 11 - (suma % 11);${v2 ? `
    gs.debug('[Validar RUT] suma=' + suma + ' resto=' + resto);` : ''}
    var esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    outputs.valido = (dv === esperado);
    outputs.rut_normalizado = cuerpo + '-' + dv;${v2 ? `
    outputs.formato_largo = cuerpo.replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + '-' + dv;` : ''}
})(inputs, outputs);`

// En un export real cada entrada del update set lleva el registro principal y todos sus
// registros hijos dentro del mismo payload: el flow con su trigger, sus acciones y los
// valores de cada variable; la action con sus steps. No hay una entrada por variable.
const varPairs = (v2) => [
  [V(1), AI1, 'table', 'sys_user'],
  [V(2), AI1, 'condition', 'user_name={{trigger.current.requested_for.user_name}}'],
  [V(3), AI2, 'table', 'incident'],
  [V(4), AI2, 'short_description', v2
    ? 'Incidente urgente creado desde {{trigger.current.number}} ({{trigger.current.requested_for.name}})'
    : 'Incidente creado desde {{trigger.current.number}}'],
  [V(5), AI2, 'caller_id', '{{1.record.sys_id}}'],
  [V(6), AI2, 'urgency', v2 ? '2' : '1'],
  ...(v2 ? [[V(9), AI2, 'assignment_group', 'Service Desk']] : []),
  [V(7), AI3, 'recipients', 'group:service_desk'],
  [V(8), AI3, 'message', 'Se creó el incidente {{2.record.number}} a partir de la solicitud {{trigger.current.number}}.']
]

const makeParts = (v2) => {
  const flowParts = [
    ['sys_hub_flow', {
      sys_id: FLOW,
      name: 'Crear incidente desde solicitud',
      internal_name: 'crear_incidente_desde_solicitud',
      description: v2
        ? 'Cuando se crea una solicitud urgente, crea el incidente asociado, lo asigna y notifica al grupo.'
        : 'Cuando se crea una solicitud marcada como urgente, crea el incidente asociado y notifica al grupo.',
      type: 'flow',
      active: 'true',
      run_as: 'user_who_initiates',
      sys_created_by: 'admin',
      sys_updated_on: v2 ? '2026-09-19 09:22:40' : '2026-08-14 12:04:11'
    }],
    ['sys_hub_trigger_instance', {
      sys_id: TRIG, flow: FLOW, label: 'Created — sc_request', name: 'record_created',
      table: 'sc_request', order: '0', condition: 'urgency=1^active=true'
    }],
    ['sys_hub_action_instance', {
      sys_id: AI1, flow: FLOW, label: 'Buscar solicitante', name: 'Look Up Record', order: '100'
    }],
    ['sys_hub_flow_logic', {
      sys_id: LOGIC, flow: FLOW, label: 'If — solicitante activo', name: 'IF', order: '200'
    }],
    ['sys_hub_action_instance', {
      sys_id: AI2, flow: FLOW, parent: LOGIC, label: 'Crear incidente', name: 'Create Record', order: '210'
    }],
    ['sys_hub_action_instance', {
      sys_id: AI3, flow: FLOW, label: 'Notificar al grupo', name: 'Send Notification', order: '300'
    }],
    ...(v2 ? [['sys_hub_action_instance', {
      sys_id: AI4, flow: FLOW, label: 'Registrar en el log', name: 'Log', order: '400'
    }]] : [])
  ]

  for (const [i, [id, doc, name, value]] of varPairs(v2).entries()) {
    const variable = 'dddd000000000000000000000000' + String(i).padStart(4, '0')
    flowParts.push(['sys_variable_value', {
      sys_id: id, document: 'sys_hub_action_instance', document_key: doc, variable, value
    }])
    flowParts.push(['var_dictionary', {
      sys_id: variable, element: name, column_label: name, internal_type: 'string'
    }])
  }

  const actionParts = [
    ['sys_hub_action_type_definition', {
      sys_id: ACTION, name: 'Validar RUT', internal_name: 'validar_rut',
      description: 'Valida el dígito verificador de un RUT chileno y devuelve el RUT normalizado.',
      category: 'Utilidades', active: 'true'
    }],
    ['sys_hub_action_input', {
      sys_id: 'eeee0000000000000000000000000001', model: ACTION, element: 'rut',
      label: 'RUT', internal_type: 'string', mandatory: 'true'
    }],
    ['sys_hub_action_output', {
      sys_id: 'eeee0000000000000000000000000002', model: ACTION, element: 'valido',
      label: 'Válido', internal_type: 'boolean'
    }],
    ['sys_hub_action_output', {
      sys_id: 'eeee0000000000000000000000000003', model: ACTION, element: 'rut_normalizado',
      label: 'RUT normalizado', internal_type: 'string'
    }],
    ['sys_hub_step', {
      sys_id: STEP1, action: ACTION, label: 'Calcular dígito verificador', name: 'Script', order: '100'
    }],
    ['sys_variable_value', {
      sys_id: 'ffff0000000000000000000000000001', document: 'sys_hub_step', document_key: STEP1,
      variable: 'dddd000000000000000000000000f001', value: scriptFor(v2)
    }],
    ['var_dictionary', {
      sys_id: 'dddd000000000000000000000000f001', element: 'script', column_label: 'Script'
    }],
    ['sys_hub_step', {
      sys_id: STEP2, action: ACTION, label: 'Registrar resultado', name: 'Log', order: '200',
      values: JSON.stringify(v2
        ? { level: 'warn', message: 'RUT {{inputs.rut}} validado: {{outputs.valido}} ({{outputs.rut_normalizado}})' }
        : { level: 'info', message: 'RUT {{inputs.rut}} validado: {{outputs.valido}}' })
    }]
  ]

  return [
    setRecord(v2),
    entry('Flow', 'sys_hub_flow_' + FLOW, 'Crear incidente desde solicitud', rec(...flowParts),
          'sys_hub_flow', v2 ? '2026-09-19 09:22:40' : '2026-08-14 12:04:11'),
    entry('Action', 'sys_hub_action_type_definition_' + ACTION, 'Validar RUT', rec(...actionParts),
          'sys_hub_action_type_definition', v2 ? '2026-09-19 09:25:10' : '2026-08-14 12:06:02')
  ]
}

const wrap = (parts, date) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<unload unload_date="' + date + '">\n' +
  parts.join('\n') + '\n</unload>'

export const SAMPLE_XML = wrap(makeParts(false), '2026-08-14 12:10:00')
export const SAMPLE_XML_V2 = wrap(makeParts(true), '2026-09-19 09:30:00')
