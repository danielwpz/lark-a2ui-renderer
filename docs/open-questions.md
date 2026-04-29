# Open Questions

These items should not be guessed. They need official documentation, real
payloads, or decisions from the library owner before implementation hardens.

## Raw Feishu/Lark Callback Payloads

Needed samples:

- Button click callback with only `value`.
- Form submit callback containing text input values.
- Select or checkbox-style callback containing selected values.
- Date/time picker callback, if supported in the first implementation.

Decision needed:

- Whether additional host adapters should wrap `extractLarkCallback` with
  framework-specific request verification and routing.

Current experiment:

- `test/integration/lark.interactive.test.ts` can send a real card and log the
- raw `card.action.trigger` payload when explicitly enabled, then convert it to
  normalized callback input and A2UI `userAction`.
- The test is skipped by default and should not be used as a normal unit test.

## Catalog ID

The current catalog id is experimental:

```text
urn:a2ui:catalog:lark-card:v0_8
```

Before publishing, choose a stable URI:

```text
https://<owned-domain-or-repo>/a2ui/catalogs/lark-card/v0_8/catalog.json
```

## Stateful Callback Registry

The current fixtures use stateless callback envelopes with `actionName`.
Production likely needs stateful callback bindings with `actionId` to keep
button payloads small and tamper-resistant.

Decision needed:

- Is `actionId` mandatory in production mode?
- Which storage key is owned by the host app: Lark `message_id`, Lark `card_id`,
  A2UI `surfaceId`, or a separate application session id?

## Form Semantics

The catalog introduces `Form` as a custom A2UI v0.8 catalog component. This is
intentional, but the first implementation needs real Feishu/Lark constraints:

- Which input components must be direct children of a form?
- Whether submit buttons must be inside the form container or can be referenced
  externally.
- How Lark reports missing required fields.
- Whether all selected values are strings or whether some controls return typed
  values.

## Rendering Budget

The semantic spec does not yet define hard budgets for:

- Maximum card JSON bytes.
- Maximum node count.
- Maximum text length per field.
- Maximum number of rows/options.

These should come from Feishu/Lark platform limits and operational experience.

Observed Lark pixel-grid experiments suggest that card element/component counts
become the limiting factor before raw JSON size. A 7 by 27 display succeeded in
real Lark testing, while larger layouts such as 10 by 40 exceeded card limits.
The live `Grid` renderer should keep this as a Lark-specific budget, not as a
channel-neutral A2UI rule.

## Dynamic Data Source Extension

The dynamic data source extension is intentionally experimental:

```text
urn:a2ui:extension:dynamic-data:v0_1
```

Open decisions before hardening:

- Whether `dataSourceUpdate` should stay as a top-level extension message or be
  folded into a future official A2UI version.
- Which `policy` fields are declaration-only and which are actually enforced by
  the first TypeScript runtime.
- Whether inline bash is allowed in production or must be replaced by named,
  host-approved scripts.
- How dynamic data source declarations should be persisted and stopped when a
  surface is deleted.
- Whether computed property bindings should be added after the initial
  fully-materialized data model approach.

The MVP decision is narrower: implement only the `bash` driver with interval
trigger and JSON stdout, then update the surface data model.
