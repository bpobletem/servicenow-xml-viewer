---
name: sn-fixtures
description: Recover ServiceNow XML the user pasted into this session and run the parser and model against it headlessly in the browser pane, without clicking through the UI. Use this skill whenever you need to verify a change to src/lib/xml.js, src/lib/model.js or src/lib/diff.js against the user's real data, whenever the user says an XML "looks wrong" or "renders fine on its own but not in the comparison", whenever you need step counts, input names, root counts or orphan tables for a real export, and whenever a large XML paste has scrolled out of context after a compaction. Reach for this before asking the user to paste a big XML again — the paste is still in the session transcript.
---

# Real-data fixtures and headless verification

The sample data in `src/lib/sample.js` is synthetic and does not have the shape of a real
export (it uses `sys_hub_step` where real data uses `sys_hub_step_instance`, and it has tens
of records where real data has hundreds). Passing on the sample proves very little. This
skill gets real data in front of the code quickly.

Read the `servicenow-xml` skill first if you are changing parsing or model logic — it explains
what the numbers you are about to check actually mean.

## 1. Recover the XML from the transcript

Large pastes never reach disk, but they are in the session `.jsonl`. The transcript path is
`~/.claude/projects/<slugified-cwd>/<session-id>.jsonl`; after a compaction it is also quoted
in the summary message.

```bash
python3 .claude/skills/sn-fixtures/scripts/extract_xml.py \
  ~/.claude/projects/<slug>/<session-id>.jsonl \
  /path/to/scratchpad
```

It picks the message holding the most *closed* `<record_update>` blocks — a compaction summary
quotes `<record_update table="...">` in prose and is newer than the real paste, so recency
alone picks the wrong message — then writes one file per block, printing each path, size and
`table` attribute. Two files usually means the user sent a
before/after pair for a comparison.

Write fixtures to the session scratchpad, not into the repo.

## 2. Serve them to the dev server

Vite only serves files from the project, so copy the fixtures into `public/`:

```bash
mkdir -p public && cp /path/to/scratchpad/real_0.xml public/__a.xml \
                     /path/to/scratchpad/real_1.xml public/__b.xml
```

Use the `__` prefix as a reminder that these are temporary. **Delete them and remove `public/`
when you are done** — they are customer data and they do not belong in the repo.

## 3. Run the model headlessly

Start the dev server with `preview_start {name: "sn-xml-viewer"}` (the launch config lives in
the *parent* directory's `.claude/launch.json`, which is a recurring surprise), then use
`javascript_tool` rather than driving the UI. Import with a cache-buster so you get the code
you just edited rather than a stale module:

```js
const t = Date.now();
const [{ buildModel }, { buildComparison, diffNodes }] = await Promise.all([
  import('/src/lib/model.js?x=' + t),
  import('/src/lib/diff.js?x=' + t)
]);
const [a, b] = await Promise.all([
  fetch('/__a.xml').then(r => r.text()),
  fetch('/__b.xml').then(r => r.text())
]);
const ma = buildModel(a), mb = buildModel(b);
({
  records: [ma.records.length, mb.records.length],
  roots:   [ma.roots.map(r => r.table + ':' + r.title), mb.roots.map(r => r.table + ':' + r.title)],
  steps:   [ma.roots[0].stepCount, mb.roots[0].stepCount],
  orphans: [ma.orphans.length, mb.orphans.length],
  main:    buildComparison(ma, mb).main.map(e => e.title + ':' + e.status)
});
```

Return a small summary object. Returning whole records floods the result with 600-line
scripts — one step's inputs once returned the entire REST script inline. When you do need to
inspect a record, project just the fields you care about and slice long values.

## 4. What the numbers should look like

For a single-action export these are the signals that something regressed:

| Check | Healthy | Regression means |
|---|---|---|
| `roots.length` | 1 per pasted action/flow | primary-record detection broke; the sidebar will fill with junk |
| `stepCount` | matches Flow Designer | step detection or the `action` → `sys_id` link broke |
| input/output counts | no repeated names | a `model.refs.get()` call is missing `uniqueRefs` |
| `orphans` tables | no `sys_documentation` / `sys_choice` | `METADATA_TABLES` filtering broke |
| `buildComparison().main` | one entry, the action | root selection broke |

Always run the same check against `SAMPLE_XML` and `SAMPLE_XML_V2` from `src/lib/sample.js` in
the same call. A fix for real data that silently breaks the demo is a bad trade — the demo is
the first thing a new user sees.

## 5. Confirm visually, then clean up

The headless check proves the model; a screenshot proves the UI. To load a fixture without
typing a megabyte into a textarea, set the value through the native setter so Vue's `v-model`
sees it:

```js
const ta = document.querySelector('textarea');
const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
d.set.call(ta, await fetch('/__a.xml').then(r => r.text()));
ta.dispatchEvent(new Event('input', { bubbles: true }));
```

Then click the process/compare button and screenshot. Widen the viewport first
(`resize_window` to about 1400×950) — the default pane is too narrow for the side-by-side diff
— and reset it to `desktop` when you finish.

Finally: delete `public/__a.xml`, `public/__b.xml` and the `public/` directory if you created
it, and confirm `git status` (or a plain `ls`) is clean before reporting back.
