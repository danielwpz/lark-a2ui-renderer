# Lark A2UI Examples

## Confirmation Card

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
              "children": { "explicitList": ["prompt", "actions"] }
            }
          }
        },
        {
          "id": "prompt",
          "component": {
            "Text": {
              "text": { "literalString": "Confirm this order?" }
            }
          }
        },
        {
          "id": "actions",
          "component": {
            "Row": {
              "children": { "explicitList": ["confirm_button"] },
              "distribution": "end"
            }
          }
        },
        {
          "id": "confirm_label",
          "component": {
            "Text": {
              "text": { "literalString": "Confirm" }
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
                  { "key": "confirmed", "value": { "literalBoolean": true } }
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

## Form Submit Card

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
            { "key": "reason", "valueString": "" },
            {
              "key": "priority",
              "valueMap": [{ "key": "0", "valueString": "normal" }]
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
          "id": "root",
          "component": {
            "Column": {
              "children": { "explicitList": ["intro", "form"] }
            }
          }
        },
        {
          "id": "intro",
          "component": {
            "Text": {
              "text": { "literalString": "Provide a reason and priority." }
            }
          }
        },
        {
          "id": "form",
          "component": {
            "Form": {
              "children": { "explicitList": ["reason_field", "priority_field"] },
              "submit": "submit_button"
            }
          }
        },
        {
          "id": "reason_field",
          "component": {
            "TextField": {
              "name": "reason",
              "label": { "literalString": "Reason" },
              "text": { "path": "/form/reason" },
              "textFieldType": "longText",
              "required": true
            }
          }
        },
        {
          "id": "priority_field",
          "component": {
            "MultipleChoice": {
              "name": "priority",
              "label": { "literalString": "Priority" },
              "selections": { "path": "/form/priority" },
              "options": [
                { "label": { "literalString": "Normal" }, "value": "normal" },
                { "label": { "literalString": "High" }, "value": "high" }
              ],
              "maxAllowedSelections": 1,
              "variant": "select"
            }
          }
        },
        {
          "id": "submit_label",
          "component": {
            "Text": {
              "text": { "literalString": "Submit" }
            }
          }
        },
        {
          "id": "submit_button",
          "component": {
            "Button": {
              "child": "submit_label",
              "primary": true,
              "action": {
                "name": "submit_form",
                "context": [
                  { "key": "reason", "value": { "path": "/form/reason" } },
                  { "key": "priority", "value": { "path": "/form/priority" } }
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
      "surfaceId": "request_form",
      "catalogId": "urn:a2ui:catalog:lark-card:v0_8",
      "root": "root"
    }
  }
]
```

## Experimental Dynamic Service Status

This uses the custom dynamic data source extension. It is not official A2UI
v0.8. The bash producer returns JSON, writes it to `/service`, and ordinary
`Text` components bind to that data.

Keep inline bash simple. `program.script` is executed by `bash -lc`, so nested
`node -e` commands with backticks or `${...}` need careful quoting. Prefer
`printf` for simple JSON examples.

```json
[
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
  },
  {
    "surfaceUpdate": {
      "surfaceId": "service_status",
      "components": [
        {
          "id": "root",
          "component": {
            "Column": {
              "children": { "explicitList": ["title", "status", "latency"] }
            }
          }
        },
        {
          "id": "title",
          "component": {
            "Text": {
              "text": { "literalString": "Service status" }
            }
          }
        },
        {
          "id": "status",
          "component": {
            "Text": {
              "text": { "path": "/service/status" }
            }
          }
        },
        {
          "id": "latency",
          "component": {
            "Text": {
              "text": { "path": "/service/latencyMs" }
            }
          }
        }
      ]
    }
  },
  {
    "beginRendering": {
      "surfaceId": "service_status",
      "catalogId": "urn:a2ui:catalog:lark-card:v0_8",
      "root": "root"
    }
  }
]
```

## Experimental Dynamic Pixel Grid

Pixel grids are a specialized use case of dynamic data. Use this pattern only
when the UI really needs a matrix of colored cells.

```json
[
  {
    "dataSourceUpdate": {
      "surfaceId": "pixel_display",
      "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
      "sources": [
        {
          "id": "pixels",
          "driver": "bash",
          "trigger": { "type": "interval", "everyMs": 1000 },
          "program": {
            "script": "printf '{\"pixels\":[[\"#ffffff\",\"#ff4d4f\"],[\"#52c41a\",\"#ffffff\"]]}'"
          },
          "output": { "format": "json", "target": "/display" },
          "policy": { "timeoutMs": 500, "maxOutputBytes": 20000 }
        }
      ]
    }
  },
  {
    "surfaceUpdate": {
      "surfaceId": "pixel_display",
      "components": [
        {
          "id": "display",
          "component": {
            "Grid": {
              "rows": 2,
              "cols": 2,
              "cellSize": 16,
              "gap": 0,
              "backgroundColor": "#ffffff",
              "cellBackgrounds": { "path": "/display/pixels" }
            }
          }
        }
      ]
    }
  },
  {
    "beginRendering": {
      "surfaceId": "pixel_display",
      "catalogId": "urn:a2ui:catalog:lark-card-live:v0_1",
      "root": "display"
    }
  }
]
```
