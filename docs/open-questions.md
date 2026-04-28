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
