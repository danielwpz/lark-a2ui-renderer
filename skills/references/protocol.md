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

Use the exact v0.8 field name `root`. Do not use `rootComponentId`, `rootId`,
or the v0.9 component shape.

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

Experimental dynamic surfaces may also use `Grid` from the live catalog
`urn:a2ui:catalog:lark-card-live:v0_1`. `Grid` is our extension and is not an
official A2UI v0.8 base component.

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

### Experimental Grid

`Grid` is a two-dimensional layout container. It may place real child
components row-major into cells with `children.explicitList`. For pixel-display
experiments, it may also bind cell backgrounds to a data-model matrix.

```json
{
  "Grid": {
    "rows": 7,
    "cols": 27,
    "cellSize": 16,
    "gap": 0,
    "backgroundColor": "#ffffff",
    "cellBackgrounds": { "path": "/clock/pixels" }
  }
}
```

Use the live catalog id when the root surface uses `Grid`:

```json
{
  "beginRendering": {
    "surfaceId": "pixel_clock",
    "catalogId": "urn:a2ui:catalog:lark-card-live:v0_1",
    "root": "display"
  }
}
```

## Experimental Dynamic Data Sources

Dynamic data sources are a custom extension, not official A2UI v0.8. Use them
only when the user explicitly asks for dynamic content. The goal is to describe
how data is produced over time, not to make components execute commands.

The extension message is `dataSourceUpdate`:

```json
{
  "dataSourceUpdate": {
    "surfaceId": "service_status",
    "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
    "sources": [
      {
        "id": "service",
        "driver": "bash",
        "trigger": { "type": "interval", "everyMs": 1000 },
        "program": {
          "script": "printf '{\"status\":\"healthy\",\"latencyMs\":42}'"
        },
        "output": { "format": "json", "target": "/service" },
        "policy": { "timeoutMs": 500, "maxOutputBytes": 4096 }
      }
    ]
  }
}
```

Mental model:

```text
dataSource produces fresh JSON
  -> runtime writes it into dataModel at output.target
  -> components read the updated dataModel with path bindings
```

Rules:

- `path` is not a function. `path` only reads from the current data model.
- The first supported data source driver is `bash`.
- The bash script must print one JSON value to stdout. Prefer JSON objects.
- `output.target` is a JSON Pointer where the parsed value is written.
- For live updates, use `trigger.type: "interval"` and `everyMs: 1000` for a
  one-second update frequency.
- Components should bind to the updated data model, for example
  `{ "path": "/service/status" }`.
- Do not put bash commands inside `Text.text.path`, `Button.action.context`, or
  component properties. Commands belong only in `dataSourceUpdate.program`.
- `program.script` is executed by `bash -lc`. Shell quoting rules apply before
  any nested program such as `node -e`, `python -c`, `awk`, or `jq` sees the
  code.

Use dynamic data sources for changing status, metrics, queues, countdowns,
choices, clocks, inventory, or other values that refresh without a user click.
Do not use them for static copy or normal form input.

Design the output JSON around what the UI needs to display:

```json
{
  "status": "healthy",
  "latencyMs": 42,
  "updatedAt": "2026-04-29T10:00:00Z"
}
```

Then bind components to stable paths:

```json
{
  "Text": {
    "text": { "path": "/service/status" }
  }
}
```

### Bash Quoting Guidance

Prefer simple producers that print JSON directly:

```json
{
  "program": {
    "script": "printf '{\"status\":\"healthy\",\"latencyMs\":42}'"
  }
}
```

Avoid inline scripts where bash can expand nested JavaScript/Python syntax before
the nested runtime sees it. This is dangerous:

```json
{
  "program": {
    "script": "node -e \"console.log(`update ${Date.now()}`)\""
  }
}
```

The shell may treat backticks as command substitution and `${...}` as shell
parameter expansion.

If inline `node -e` is necessary, wrap the nested code in shell single quotes
and avoid unescaped single quotes inside the nested code:

```json
{
  "program": {
    "script": "node -e 'console.log(JSON.stringify({status:\"healthy\", updatedAt:new Date().toISOString()}))'"
  }
}
```

For complex logic, prefer a script file or host-provided producer instead of a
large inline command.

For list-like dashboards, the current renderer does not support dynamic child
templates yet. Use a fixed number of display slots and bind them to stable
indexes such as `/jobs/items/0/state`.

Pixel clocks are only one specialized use case. For pixel displays, make the
producer return a color matrix and bind `Grid.cellBackgrounds` to it:

```json
{
  "Grid": {
    "rows": 7,
    "cols": 27,
    "cellSize": 16,
    "gap": 0,
    "backgroundColor": "#ffffff",
    "cellBackgrounds": { "path": "/clock/pixels" }
  }
}
```

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
