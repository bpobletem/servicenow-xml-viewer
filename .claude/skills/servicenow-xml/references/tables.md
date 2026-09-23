# ServiceNow tables seen in real exports

Observed in exports from a Washington-era instance (actions and flows). Field names vary
between versions, so treat this as "what has been seen", not a schema. The code resolves
things by reverse reference wherever possible so that an unknown variant still degrades to a
readable field table rather than an error.

## Contents

- [Actions](#actions)
- [Flows](#flows)
- [Values and mappings](#values-and-mappings)
- [Metadata / noise](#metadata--noise)
- [Update set wrappers](#update-set-wrappers)

## Actions

| Table | Role | Links to parent via |
|---|---|---|
| `sys_hub_action_type_definition` | the action itself | — (this is the primary record) |
| `sys_hub_action_type_snapshot` | published snapshot of the action | `action_type` / referenced by the definition's `latest_snapshot` |
| `sys_hub_step_instance` | **a step** | `action` → action `sys_id` |
| `sys_hub_step_ext_input` | inputs declared by a step type | referenced from mapping table names |
| `sys_hub_step_ext_output` | outputs declared by a step type | as above |
| `sys_hub_action_input` | action input | `model` → action `sys_id` |
| `sys_hub_action_output` | action output | `model` → action `sys_id` |
| `sys_hub_action_plan` | execution plan | `action_type` |
| `sys_hub_action_status_metadata` | status metadata | `action_type` |
| `sys_hub_status_condition` | a named status condition | `action_type` / plan |

Useful fields on `sys_hub_step_instance`:

- `label` — the human name shown in Flow Designer ("Look up customer record")
- `order` — step order (1, 2, 3…), used for sorting
- `action` — parent action `sys_id`
- `step_type` — `sys_id` of the step type definition (Script, REST, Update Record…). The
  definition itself is usually **not** in the export, so the type name often cannot be shown.
- `cid` — a UUID used inside mapping expressions as `{{step[<cid>].<field>}}`. This is how a
  step refers to another step's output, and it is the only reliable way to trace data flow
  between steps.
- `error_handling_type`

Note the mismatch with `src/lib/sample.js`, which uses `sys_hub_step` for its synthetic demo
action. Step detection matches `/step/i` on the table name so both work, but never assume the
sample's shape is what real data looks like.

## Flows

| Table | Role | Links to parent via |
|---|---|---|
| `sys_hub_flow` | the flow or subflow | — (primary) |
| `sys_hub_trigger_instance` | trigger | `flow` |
| `sys_hub_action_instance` | an action call inside the flow | `flow`, nested via `parent` |
| `sys_hub_flow_logic` | if / for-each / try, etc. | `flow`, nested via `parent` |
| `sys_hub_flow_block` | block grouping | `flow` |
| `sys_hub_flow_input` / `sys_hub_flow_output` | flow I/O | `flow` |

A flow is a subflow when `type` contains `subflow`. Nesting is resolved by
`firstRef(fields, ['parent', 'parent_instance', 'block', 'flow_block'])`.

## Values and mappings

These two carry the actual content of a step, and they behave differently.

**`sys_element_mapping`** — declarative input mappings.

```
id     -> step sys_id
field  -> input name        e.g. "accessID"
value  -> mapping expression e.g. "{{action.record_id}}"
table  -> var__m_sys_hub_step_ext_input_<step sys_id>
          or var__m_sys_flow_step_definition_input_<step type sys_id>
```

An entry from the `sys_flow_step_definition_input` variant with an empty `value` means the
step type declares that input but nothing is mapped to it — it is not a missing value bug.

**`sys_variable_value`** — stored values, including scripts.

```
document     -> "sys_hub_step_instance" (or sys_hub_action_instance for flows)
document_key -> step sys_id
variable     -> var_dictionary sys_id   (usually NOT in the export — see Rule 5)
value        -> the value; for script steps this is the whole script
order        -> ordering within the step's variables
```

**`var_dictionary`** — the variable definition (`element`, `column_label`, `internal_type`).
Present for flow variables, generally absent for step-type variables.

## Metadata / noise

| Table | What it is |
|---|---|
| `sys_documentation` | field labels and hints, keyed by table + element (~200 per action) |
| `sys_choice` | choice list options, often nested inside a parent element |
| `sys_translated_text` | translations |
| `sys_complex_object` | complex object type definitions |

Listed in `METADATA_TABLES` in `src/lib/model.js`. Keep them available for name resolution,
keep them out of anything the user browses.

## Update set wrappers

| Element | Notes |
|---|---|
| `<unload unload_date="...">` | document root of a full update set |
| `<sys_update_xml>` | one update entry; `name`, `type`, `target_name`, `update_set`, `payload` |
| `<payload>` | escaped XML string; may have multiple roots, hence the `<payload_root>` wrap retry |
| `<record_update table="X">` | the block whose `table` attribute names the primary record |

When a payload is empty or unparseable the parser emits a `sys_update_xml` record instead of
dropping the entry, so a deleted or truncated payload is visible rather than silent.
