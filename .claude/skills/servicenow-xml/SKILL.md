---
name: servicenow-xml
description: Structure of ServiceNow update-set and record XML exports (sys_update_xml, record_update, sys_hub_flow, sys_hub_action_type_definition, sys_hub_step_instance, sys_variable_value, sys_element_mapping) and the parsing rules this repo relies on. Use this skill whenever you touch src/lib/xml.js, src/lib/model.js, src/lib/tables.js or src/lib/diff.js, whenever a user reports that an action/flow renders wrong, shows the wrong record, shows duplicated inputs or outputs, shows no steps, or fills the sidebar with hundreds of entries, and whenever you are adding support for a new ServiceNow table. The export format has several non-obvious rules that are easy to rediscover the hard way — read this before changing parsing or model code.
---

# ServiceNow XML exports

This app turns pasted ServiceNow XML into a readable view of flows and actions. Everything
runs in the browser, there is no schema, and exports differ between instances and versions.
The code is therefore deliberately tolerant: it indexes by `sys_id`, guesses relationships
from reverse references, and falls back to a generic field table when it does not recognise
a table.

That tolerance is also the main hazard. A rule that is "almost right" does not crash — it
quietly produces a plausible-looking wrong answer. Most of the rules below exist because a
plausible-looking wrong answer shipped once.

## The three shapes of input

A user can paste any of these, and the parser auto-detects which:

1. **Full update set** — `<unload>` → many `<sys_update_xml>` → each with an escaped
   `<payload>` string that itself contains a `<record_update>`.
2. **A single update entry** — one `<record_update table="...">` with the main record plus
   every related record inlined. This is what you get from the per-record XML view inside an
   update set, and it is the common case for real debugging.
3. **A bare "Export > XML" unload** — one record element at the document root.

`walkRoot` / `walk` in `src/lib/xml.js` handle all three. The container tags that are
recursed into rather than treated as records are `record_update`, `unload`, `records` and
the synthetic `payload_root`.

## Rule 1 — `<record_update table="X">` names the primary record

This is the single most important rule and the one that is easiest to miss.

A single `<record_update>` block for one action can contain **600+ records**: the action, its
steps, every input and output, mappings, status conditions, snapshots, choice lists and
label translations. Only the element whose tag equals the `table` attribute is the record the
user actually exported. Everything else is supporting data that travels with it.

`makeRecord` therefore sets `primary: true` on that record, and `pickRoots` in
`src/lib/model.js` uses primary records as the top-level entries.

Before this rule existed, the model promoted every record of an unrecognised table to a
top-level entry. A single action produced hundreds of sidebar entries, and the comparison
view happened to select a `sys_hub_status_condition` record whose `label` read like a step
name — so it looked like a broken diff rather than a wrong record.

If you ever need to relax this, relax it *forward* (fall back to the old heuristic when no
record is primary, which `pickRoots` already does) rather than removing it.

## Rule 2 — a record can appear twice in one export

Exports sometimes end with a second, partial copy of a record carrying only `sys_id` and a
couple of fields (`latest_snapshot`, `compiler_build`). `mergeDuplicates` in `xml.js` folds
records with the same `table` + `sys_id` into one, preferring non-empty values, so the user
does not see a phantom second entry with almost no fields.

## Rule 3 — a reverse-reference index yields a record once per referencing field

`buildModel` builds `refs`: `sys_id` → `[{record, field}]`. A record that points at the action
through two different fields appears **twice** in that list. Anything that maps over
`model.refs.get(id)` directly will double its results — which is exactly how every input and
output once rendered twice in the detail view.

Use `uniqueRefs(model, sysId)`, which dedupes by `record.id`. Treat a direct
`model.refs.get(...)` outside of `uniqueRefs` as a bug.

## Rule 4 — `startsWith('sys_hub_action_type')` matches more than you think

It also matches `sys_hub_action_type_snapshot`, which ships alongside the definition in real
exports. Since the snapshot is not primary it no longer becomes a root, but any new prefix
test should be checked against the real table list in `references/tables.md`.

## Rule 5 — some variable names cannot be resolved, by design

Step inputs come from two different places, and only one of them is self-describing:

- `sys_element_mapping` — `id` = step `sys_id`, `field` = the input name, `value` = the
  mapping expression (`{{action.record_id}}`). Self-describing, always usable.
- `sys_variable_value` — `document_key` = step `sys_id`, `variable` = a `var_dictionary`
  `sys_id`, `value` = the actual value (this is where step **scripts** live).

The `var_dictionary` row belongs to the *step type definition*, not to the action, so it does
not travel in the action's export. The name genuinely cannot be recovered from the XML.
`unresolvedName()` renders `variable · a1b2c3d4` instead of a raw 32-character id. Do not
invent a nicer-looking name by guessing from the value — a wrong label is worse than an
honest placeholder, and the value itself (e.g. a script) is still rendered in full.

## Rule 6 — metadata tables are noise, not records

`sys_documentation`, `sys_choice`, `sys_translated_text`, `sys_complex_object` and
`sys_element_mapping` are label/choice/mapping metadata. One real action brought ~240 of them.
They are useful for resolving names but listing or diffing them buries the signal, so
`METADATA_TABLES` in `model.js` keeps them out of the orphan list.

Related to this: `expandConsumed` walks references transitively from the root's consumed
records (never absorbing another primary record) so that status conditions, plans and
snapshots attach to the action instead of floating loose.

## Scale

Real exports are large: ~666 records and ~1.1 MB for a single action, 600+ line scripts inside
one field. Anything quadratic needs a guard — `align()` in `src/lib/diff.js` falls back to a
positional alignment above 2.5M DP cells rather than hanging the tab. When you add a pass over
records, ask what it costs at 1000 records before shipping it.

## Table reference

`references/tables.md` lists the tables seen in real exports, what links them to their parent,
and which fields carry the useful content. Read it when adding support for a table, when a
record renders as a generic field dump, or when you need to know which field points where.

## Verifying a change

Never judge a parsing change by the sample data alone — `src/lib/sample.js` is synthetic and
uses `sys_hub_step`, while real exports use `sys_hub_step_instance`. Use the `sn-fixtures`
skill to pull the user's real XMLs out of the session transcript and run the model headlessly
in the browser pane. A change that looks right on the sample and wrong on real data is the
normal failure mode here, not the exception.
