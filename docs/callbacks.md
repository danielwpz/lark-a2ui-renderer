# Callback Normalization

Feishu/Lark card callbacks are platform-specific. The library should hide that
shape and return A2UI v0.8 client-to-server events.

## Output Contract

The normalized callback result should be:

```json
{
  "userAction": {
    "name": "submit_form",
    "surfaceId": "request_form",
    "sourceComponentId": "submit_button",
    "timestamp": "2026-04-28T12:00:00.000Z",
    "context": {
      "reason": "Looks good",
      "priority": "high"
    }
  }
}
```

This object is what the host application can pass to business logic or to an
LLM. The raw Feishu/Lark callback should remain host/internal data.

## Callback Envelope

When compiling an A2UI `Button`, the renderer should put an envelope in the
Feishu/Lark button value.

```json
{
  "__a2ui_lark": "v0_8",
  "surfaceId": "request_form",
  "sourceComponentId": "submit_button",
  "actionName": "submit_form"
}
```

The envelope schema is defined in
[callback-envelope.schema.json](../schemas/callback-envelope.schema.json).

For the first experiment, this stateless envelope is enough. A later production
version should also support a stateful envelope:

```json
{
  "__a2ui_lark": "v0_8",
  "surfaceId": "request_form",
  "sourceComponentId": "submit_button",
  "actionId": "act_01H..."
}
```

In the stateful version, the host persists the action binding server-side and
the callback only carries an opaque id.

## Context Resolution

For a normal button:

1. Read the action metadata from the callback envelope.
2. Look up the source A2UI component in the surface state.
3. Resolve the component action context.
4. Return `userAction`.

For a form submit:

1. Read submitted field values from the Feishu/Lark callback.
2. Map field names to A2UI input component ids or `name` properties.
3. Update the surface data model for inputs that have `path` bindings.
4. Resolve the button action context.
5. Merge submitted values into `context`.
6. Return `userAction`.

Submitted form values should win over stale data-model values for the same
field.

## Raw Feishu/Lark Extraction

The first TypeScript implementation exposes:

```text
extractLarkCallback(rawPayload) -> normalizedCallbackInput
```

The extractor follows the official `card.action.trigger` callback structure:

- `event.action.value` carries the renderer callback envelope.
- `event.action.form_value` carries submitted form values.
- `header.create_time` can be converted into the callback timestamp.
- `event.operator` is preserved as metadata.

For SDKs that pass the inner event object directly, the extractor also accepts
an object with `action` at the top level. Real SDK behavior must still be
verified by the interactive Lark integration test before committing raw payload
fixtures.

## Normalized Callback Input

After extraction, the core normalizer consumes:

```json
{
  "envelope": {
    "__a2ui_lark": "v0_8",
    "surfaceId": "request_form",
    "sourceComponentId": "submit_button",
    "actionName": "submit_form"
  },
  "submittedValues": {
    "reason": "Looks good",
    "priority": "high"
  },
  "timestamp": "2026-04-28T12:00:00.000Z"
}
```

This shape is defined in
[normalized-callback-input.schema.json](../schemas/normalized-callback-input.schema.json).

## What The Library Should Validate

The callback parser should reject or return a structured error when:

- The callback does not contain the A2UI envelope.
- The `surfaceId` is unknown to the provided surface store.
- The `sourceComponentId` is not a Button in the active surface.
- The action name does not match the source component's declared action.
- A submitted field exceeds configured length limits.
- A submitted option value is not one of the declared choices.
- A raw Feishu/Lark callback extractor cannot find the renderer envelope.

## What The Library Should Not Decide

The library should not decide whether an action is allowed. For example, it
should parse an `approve` action, but it should not approve a deployment,
execute a command, or update application data. Those are host application
decisions.
