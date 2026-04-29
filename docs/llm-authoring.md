# LLM Authoring Guide for Lark A2UI v0.8

This guide is the prompt material used by integration tests when asking an LLM
to generate a card. The target output is A2UI v0.8 server messages for the
custom Lark card catalog, not Feishu/Lark Card JSON.

## Output Contract

Return JSON only. Do not wrap it in Markdown. Do not include commentary.

The JSON must be an array of A2UI v0.8 server messages. Use these message
types only:

- `dataModelUpdate` for optional initial state.
- `surfaceUpdate` for component definitions.
- `beginRendering` to choose the root component and catalog.

When and only when the task explicitly asks for experimental dynamic data,
`dataSourceUpdate` may also be used. That message belongs to our custom
extension, not official A2UI v0.8.

Every renderable output must include exactly one `beginRendering` message for
the surface being generated.

`beginRendering` must use the v0.8 field name `root`. Do not use
`rootComponentId`, `rootId`, or the v0.9 component shape.

Use this catalog id:

```text
urn:a2ui:catalog:lark-card:v0_8
```

Do not use experimental extensions unless the prompt explicitly asks for them.
Dynamic data sources and pixel-grid displays are our custom extensions, not
official A2UI v0.8 features.

## Message Shape

Use the A2UI v0.8 nested component shape:

```json
{
  "id": "component_id",
  "component": {
    "Text": {
      "text": {
        "literalString": "Visible text"
      }
    }
  }
}
```

The component object must contain exactly one component type.

## Data Model Encoding

`dataModelUpdate.contents` is an array of `DataEntry` objects. A `DataEntry`
supports only these value fields:

- `valueString`
- `valueNumber`
- `valueBoolean`
- `valueMap`

Do not use `valueArray`, `valueObject`, `value`, or raw JSON arrays inside a
`DataEntry`.

Encode objects with `valueMap`. Encode arrays as a dense numeric-key `valueMap`
using string keys `"0"`, `"1"`, `"2"`, and so on:

```json
{
  "key": "priority",
  "valueMap": [
    {
      "key": "0",
      "valueString": "normal"
    }
  ]
}
```

For scalar text fields, use `valueString`:

```json
{
  "key": "reason",
  "valueString": ""
}
```

## Supported Components

Use only these components:

- `Text`
- `Column`
- `Row`
- `Divider`
- `Button`
- `Form`
- `TextField`
- `MultipleChoice`
- `DateTimeInput`

Unsupported A2UI components are out of scope for the Lark card renderer.

## Experimental Dynamic UI

When a task explicitly asks for the dynamic data source extension, the output may
also include custom `dataSourceUpdate` messages using extension id:

```text
urn:a2ui:extension:dynamic-data:v0_1
```

The first supported data source driver is `bash`. Components still bind to the
data model with `path`; they do not call bash directly.

Use dynamic data sources for changing values such as status, metrics, queues,
countdowns, clocks, choices, or inventory. The bash script should print one JSON
value to stdout, and `output.target` should point to the data-model location
where that JSON should be written.

General pattern:

```json
{
  "dataSourceUpdate": {
    "surfaceId": "service_status",
    "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
    "sources": [
      {
        "id": "service",
        "driver": "bash",
        "trigger": {
          "type": "interval",
          "everyMs": 1000
        },
        "program": {
          "script": "printf '{\"status\":\"healthy\",\"latencyMs\":42}'"
        },
        "output": {
          "format": "json",
          "target": "/service"
        },
        "policy": {
          "timeoutMs": 500,
          "maxOutputBytes": 4096
        }
      }
    ]
  }
}
```

Then bind components to the updated data:

```json
{
  "Text": {
    "text": {
      "path": "/service/status"
    }
  }
}
```

For pixel-display tasks only, use the experimental live catalog id:

```text
urn:a2ui:catalog:lark-card-live:v0_1
```

The live catalog may use `Grid`:

```json
{
  "id": "display",
  "component": {
    "Grid": {
      "rows": 7,
      "cols": 27,
      "cellSize": 16,
      "gap": 0,
      "backgroundColor": "#ffffff",
      "cellBackgrounds": {
        "path": "/clock/pixels"
      }
    }
  }
}
```

For the first MVP, prefer a data source that returns fully materialized data,
for example a JSON object with `status`, `latencyMs`, `items`, or `pixels`.
Do not use `path` as a function. `path` only reads from the current data model.

## Layout Rules

Use `Column` as the normal root. Use `children.explicitList` with component ids:

```json
{
  "Column": {
    "children": {
      "explicitList": ["title", "body", "actions"]
    }
  }
}
```

Use `Row` for horizontal action groups. A `Button` must use a `Text` component
as its `child`.

## Actions

Buttons must declare an action:

```json
{
  "Button": {
    "child": "approve_label",
    "primary": true,
    "action": {
      "name": "approve_request",
      "context": [
        {
          "key": "approved",
          "value": {
            "literalBoolean": true
          }
        }
      ]
    }
  }
}
```

The renderer injects platform callback metadata later. Do not generate raw
Feishu/Lark callback payloads, URLs, event ids, or Card JSON `value` envelopes.

## Forms

Use `Form` when the user must provide fields before submitting. Put only field
components in `Form.children.explicitList`. Use `Form.submit` to reference a
`Button`.

Field component `name` values must be stable and unique inside the surface.
When a submitted value should appear in the final A2UI `userAction.context`,
bind the field to the data model and reference that path from the submit
button action context.

Example binding pattern:

```json
[
  {
    "dataModelUpdate": {
      "surfaceId": "request_form",
      "path": "/",
      "contents": [
        {
          "key": "form",
          "valueMap": [
            {
              "key": "reason",
              "valueString": ""
            }
          ]
        }
      ]
    }
  },
  {
    "surfaceUpdate": {
      "surfaceId": "request_form",
      "components": [
        {
          "id": "reason_field",
          "component": {
            "TextField": {
              "name": "reason",
              "label": {
                "literalString": "Reason"
              },
              "text": {
                "path": "/form/reason"
              },
              "textFieldType": "longText",
              "required": true
            }
          }
        }
      ]
    }
  }
]
```

## Text Values

For fixed visible text, use:

```json
{
  "literalString": "Text"
}
```

For data-model text, use:

```json
{
  "path": "/some/path"
}
```

## Checklist

Before returning JSON, verify:

- The top-level value is an array.
- Every component id is unique within its surface.
- Every referenced child id exists.
- The `beginRendering.root` component exists.
- The `beginRendering.catalogId` is `urn:a2ui:catalog:lark-card:v0_8`, unless
  the prompt explicitly asks for the experimental live catalog
  `urn:a2ui:catalog:lark-card-live:v0_1`.
- No raw Feishu/Lark Card JSON appears in the output.
