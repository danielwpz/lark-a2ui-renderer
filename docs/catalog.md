# Lark Card Catalog

The catalog is an A2UI v0.8 custom catalog. It tells the LLM and validators
which components may be generated for Feishu/Lark card rendering.

The current stable catalog id is:

```text
urn:a2ui:catalog:lark-card:v0_8
```

Live layout experiments that need `Grid` should use a separate experimental
catalog id:

```text
urn:a2ui:catalog:lark-card-live:v0_1
```

The live catalog is our extension. It is not an official A2UI v0.8 standard
catalog and should not be presented as one.

## v0.8 Shape

A component is wrapped by id and by a single component-type key:

```json
{
  "id": "body",
  "component": {
    "Text": {
      "text": {
        "literalString": "Review the request below."
      },
      "usageHint": "body"
    }
  }
}
```

Containers reference children by id:

```json
{
  "id": "root",
  "component": {
    "Column": {
      "children": {
        "explicitList": ["body", "actions"]
      }
    }
  }
}
```

## Supported Components

Initial supported components:

| Component | Feishu/Lark mapping | Notes |
| --- | --- | --- |
| `Text` | `markdown` or plain text element | Simple Markdown only. |
| `Column` | body `elements` sequence | `explicitList` only in the first version. |
| `Row` | `column_set` | Best for action rows and two-column summaries. |
| `Divider` | `hr` | Horizontal only in practice. |
| `Button` | `button` | Emits A2UI callback envelope. |
| `Form` | `form` | Groups input components and a submit button. |
| `TextField` | `input` | Submit-time value sync, not live two-way binding. |
| `MultipleChoice` | select or checkbox-like input | Values validated against declared options. |
| `DateTimeInput` | date/time picker | Submit-time value sync. |

Deferred components:

- `Table`
- `Collapsible`
- `Image`
- `Card`
- `Grid`

These can be added once the button and form loop is working.

## Experimental Live Components

`Grid` is the preferred abstraction for two-dimensional layout experiments. It
is a custom catalog component, not a Feishu/Lark native component and not an
official A2UI v0.8 base component.

`Grid` should be exposed to A2UI authors as one component:

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

Expected MVP semantics:

| Property | Type | Notes |
| --- | --- | --- |
| `rows` | integer | Number of grid rows. |
| `cols` | integer | Number of grid columns. |
| `cellSize` | integer | Target square cell size in pixels. |
| `gap` | integer | Target spacing between cells. `0` means no intended gap. |
| `backgroundColor` | string | Default cell color when no cell value exists. |
| `children` | child list | Optional `explicitList`; children are placed row-major into cells. |
| `cellBackgrounds` | bound value | Optional `{ "path": "/clock/pixels" }`. Resolves to a 2D color array. |

The renderer may lower this component into many platform-specific nodes. For
Lark, the implementation can compile it into `column_set` and `column` elements
with `background_style` color tokens. That lowering is a Lark renderer detail.

Pixel displays are one use case of `Grid`, not the definition of `Grid`.
Application UIs may place real child components into cells using
`children.explicitList`. The first implementation only needs static children;
data-driven templates can be added later.

`Pixel` should not be the default public abstraction. Exposing one `Pixel`
component per cell encourages very large component trees and quickly hits Lark's
card element budget. If a `Pixel` component is added later, it should be treated
as a low-level or renderer-internal primitive.

## Example

```json
[
  {
    "surfaceUpdate": {
      "surfaceId": "confirm_order",
      "components": [
        {
          "id": "root",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["prompt", "actions"]
              }
            }
          }
        },
        {
          "id": "prompt",
          "component": {
            "Text": {
              "text": {
                "literalString": "Confirm this order?"
              },
              "usageHint": "body"
            }
          }
        },
        {
          "id": "actions",
          "component": {
            "Row": {
              "children": {
                "explicitList": ["confirm_button"]
              },
              "distribution": "end"
            }
          }
        },
        {
          "id": "confirm_label",
          "component": {
            "Text": {
              "text": {
                "literalString": "Confirm"
              }
            }
          }
        },
        {
          "id": "confirm_button",
          "component": {
            "Button": {
              "child": "confirm_label",
              "primary": true,
              "action": {
                "name": "confirm",
                "context": [
                  {
                    "key": "confirmed",
                    "value": {
                      "literalBoolean": true
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    }
  },
  {
    "beginRendering": {
      "surfaceId": "confirm_order",
      "catalogId": "urn:a2ui:catalog:lark-card:v0_8",
      "root": "root"
    }
  }
]
```
