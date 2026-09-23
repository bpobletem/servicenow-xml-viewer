// Catálogo de tablas conocidas. kind: flow | action | script | config | child
export const TABLES = {
  sys_hub_flow: { label: 'Flow', kind: 'flow', icon: '⚡' },
  sys_hub_action_type_definition: { label: 'Action', kind: 'action', icon: '🧩' },
  sys_hub_action_type_base: { label: 'Action (base)', kind: 'action', icon: '🧩' },

  // piezas internas de flows / actions
  sys_hub_trigger_instance: { label: 'Trigger', kind: 'child', icon: '🎯' },
  sys_hub_action_instance: { label: 'Action instance', kind: 'child', icon: '▸' },
  sys_hub_flow_logic: { label: 'Flow logic', kind: 'child', icon: '⑂' },
  sys_hub_flow_block: { label: 'Bloque', kind: 'child', icon: '⬚' },
  sys_hub_flow_output: { label: 'Output del flow', kind: 'child', icon: '↥' },
  sys_hub_flow_input: { label: 'Input del flow', kind: 'child', icon: '↧' },
  sys_hub_step: { label: 'Step', kind: 'child', icon: '▪' },
  sys_hub_step_ext: { label: 'Step (ext)', kind: 'child', icon: '▪' },
  sys_hub_step_instance: { label: 'Step instance', kind: 'child', icon: '▪' },
  sys_hub_action_input: { label: 'Input de la action', kind: 'child', icon: '↧' },
  sys_hub_action_output: { label: 'Output de la action', kind: 'child', icon: '↥' },
  sys_variable_value: { label: 'Valor de variable', kind: 'child', icon: '=' },
  var_dictionary: { label: 'Definición de variable', kind: 'child', icon: '𝑥' },
  sys_dictionary: { label: 'Diccionario', kind: 'child', icon: '𝑥' },
  sys_documentation: { label: 'Etiqueta', kind: 'child', icon: '🏷' },
  sys_translated_text: { label: 'Texto traducido', kind: 'child', icon: '🏷' },
  sys_hub_flow_snapshot: { label: 'Snapshot del flow', kind: 'child', icon: '📸' },

  // scripts y otros artefactos comunes
  sys_script: { label: 'Business Rule', kind: 'script', icon: '📜' },
  sys_script_include: { label: 'Script Include', kind: 'script', icon: '📜' },
  sys_script_client: { label: 'Client Script', kind: 'script', icon: '📜' },
  sys_script_fix: { label: 'Fix Script', kind: 'script', icon: '📜' },
  sys_ui_action: { label: 'UI Action', kind: 'script', icon: '🔘' },
  sys_ui_policy: { label: 'UI Policy', kind: 'config', icon: '🧾' },
  sys_ui_policy_action: { label: 'UI Policy Action', kind: 'child', icon: '🧾' },
  sysauto_script: { label: 'Scheduled Job', kind: 'script', icon: '⏱' },
  sysevent_script_action: { label: 'Script Action', kind: 'script', icon: '📜' },
  sys_processor: { label: 'Processor', kind: 'script', icon: '📜' },
  sys_ws_operation: { label: 'Scripted REST Resource', kind: 'script', icon: '🌐' },
  sys_rest_message: { label: 'REST Message', kind: 'config', icon: '🌐' },
  sys_rest_message_fn: { label: 'REST Method', kind: 'child', icon: '🌐' },
  sys_transform_map: { label: 'Transform Map', kind: 'config', icon: '🔀' },
  sys_transform_script: { label: 'Transform Script', kind: 'script', icon: '📜' },
  sc_cat_item: { label: 'Catalog Item', kind: 'config', icon: '🛒' },
  item_option_new: { label: 'Variable de catálogo', kind: 'child', icon: '𝑥' },
  sys_properties: { label: 'System Property', kind: 'config', icon: '⚙️' },
  sys_update_xml: { label: 'Entrada de update set', kind: 'config', icon: '📦' }
}

export function tableInfo(table) {
  return TABLES[table] || { label: table, kind: 'generic', icon: '📄' }
}
