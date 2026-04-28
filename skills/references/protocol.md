# Lark A2UI v0.8 Protocol Reference

This reference defines the A2UI subset accepted by `lark-a2ui-renderer`.

## Output Shape

Produce a JSON array of A2UI server messages:

```json
[
  { "dataModelUpdate": { "...": "..." } },
  { "surfaceUpdate": { "...": "..." } },
  { "beginRendering": { "...": "..." } }
]
```

Do not produce Feishu/Lark Card JSON. The renderer owns that conversion.

## Messages

`dataModelUpdate` writes data referenced by bindings:

```json
{
  "dataModelUpdate": {
    "surfaceId": "request_form",
    "path": "/",
    "contents": [
      {
        "key": "form",
        "valueMap": [{ "key": "reason", "valueString": "" }]
      }
    ]
  }
}
```

`surfaceUpdate` defines components:

```json
{
  "surfaceUpdate": {
    "surfaceId": "request_form",
    "components": [
      {
        "id": "root",
        "component": {
          "Column": {
            "children": { "explicitList": ["title"] }
          }
        }
      }
    ]
  }
}
```

`beginRendering` selects the root component:

```json
{
  "beginRendering": {
    "surfaceId": "request_form",
    "catalogId": "urn:a2ui:catalog:lark-card:v0_8",
    "root": "root"
  }
}
```

## Bound Values

Use one of these shapes wherever text or action context values are bound:

```json
{ "path": "/form/reason" }
{ "literalString": "Submit" }
{ "literalNumber": 1 }
{ "literalBoolean": true }
{ "literalArray": ["high"] }
```

## Components

All component nodes have:

```json
{
  "id": "component_id",
  "component": {
    "ComponentType": {}
  }
}
```

Supported component types:

- `Text`
- `Column`
- `Row`
- `Divider`
- `Button`
- `Form`
- `TextField`
- `MultipleChoice`
- `DateTimeInput`

### Text

```json
{
  "Text": {
    "text": { "literalString": "Review request" },
    "usageHint": "body"
  }
}
```

`usageHint` is optional. Rendering may treat it as advisory.

### Column

```json
{
  "Column": {
    "children": { "explicitList": ["title", "form"] }
  }
}
```

Only `children.explicitList` is supported.

### Row

```json
{
  "Row": {
    "children": { "explicitList": ["cancel_button", "confirm_button"] },
    "distribution": "end"
  }
}
```

`distribution` may be `start`, `center`, or `end`.

### Divider

```json
{ "Divider": { "axis": "horizontal" } }
```

### Button

```json
{
  "Button": {
    "child": "submit_label",
    "primary": true,
    "action": {
      "name": "submit_form",
      "context": [
        { "key": "reason", "value": { "path": "/form/reason" } }
      ]
    }
  }
}
```

`child` should reference a `Text` component. `danger` and `primary` are optional.

### Form

```json
{
  "Form": {
    "children": { "explicitList": ["reason_field", "priority_field"] },
    "submit": "submit_button"
  }
}
```

`submit` must reference a `Button`. The renderer renders it as the Lark form
submit control.

### TextField

```json
{
  "TextField": {
    "name": "reason",
    "label": { "literalString": "Reason" },
    "text": { "path": "/form/reason" },
    "textFieldType": "longText",
    "required": true,
    "placeholder": { "literalString": "Explain the decision" },
    "maxLength": 500
  }
}
```

Supported `textFieldType` values are `shortText`, `longText`, `number`,
`obscured`, and `email`.

Lark adaptation: `number` and `email` preserve A2UI semantics but currently
render as Lark text inputs because the real Lark API rejected those input types.

### MultipleChoice

```json
{
  "MultipleChoice": {
    "name": "priority",
    "label": { "literalString": "Priority" },
    "selections": { "path": "/form/priority" },
    "options": [
      { "label": { "literalString": "Normal" }, "value": "normal" },
      { "label": { "literalString": "High" }, "value": "high" }
    ],
    "maxAllowedSelections": 1,
    "variant": "select",
    "required": true
  }
}
```

The current renderer maps this to a Lark static select. Store selections as an
array in the data model.

### DateTimeInput

```json
{
  "DateTimeInput": {
    "name": "due_date",
    "label": { "literalString": "Due date" },
    "value": { "path": "/form/dueDate" },
    "enableDate": true,
    "enableTime": false,
    "required": true
  }
}
```

Lark adaptation: the renderer currently uses Lark `date_picker`. The attempted
`time_picker` tag was rejected by the real Lark API, so time-only semantics are
not rendered as a native Lark time picker yet.

## Lark-Specific Constraints

- Every form field `name` must be non-empty and unique within the card.
- Do not render the same interactive component twice; Lark rejects duplicate
  `name` values.
- Prefer compact cards. A chat card is not a full app surface.
- Do not use unsupported A2UI components from the broader standard catalog.

## User Replies

The reply contract is A2UI `userAction`:

```json
{
  "userAction": {
    "name": "submit_form",
    "surfaceId": "request_form",
    "sourceComponentId": "submit_button",
    "timestamp": "2026-04-28T12:00:00.000Z",
    "context": {
      "reason": "Looks good",
      "priority": ["high"]
    }
  }
}
```

Use `userAction.name` and `userAction.context` to continue the workflow. If the
UI should change, emit new A2UI messages.
