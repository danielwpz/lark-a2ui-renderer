# Lark Card Catalog

The catalog is an A2UI v0.8 custom catalog. It tells the LLM and validators
which components may be generated for Feishu/Lark card rendering.

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

These can be added once the button and form loop is working.

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
