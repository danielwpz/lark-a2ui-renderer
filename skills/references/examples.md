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

## Dynamic 7x27 Pixel Clock

Use this pattern when the user asks for a pixel clock, dot-matrix clock, LED
clock, or `HH:MM:SS` rendered as pixels. Do not use `Text` to display the time.
The visible clock must be the `Grid`; the data source returns a color matrix and
`Grid.cellBackgrounds` binds to that matrix.

This example uses 3x7 digit glyphs, two 1-column colons, and one empty column of
spacing after each digit/colon. The occupied pixels fit exactly into 7 rows and
27 columns for `HH:MM:SS`.

```json
[
  {
    "dataSourceUpdate": {
      "surfaceId": "pixel_clock",
      "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
      "sources": [
        {
          "id": "clock_pixels",
          "driver": "bash",
          "trigger": { "type": "interval", "everyMs": 1000 },
          "program": {
            "script": "node -e 'const W=27,H=7,off=\"#ffffff\";const colors=[\"#ff4d4f\",\"#1677ff\",\"#52c41a\",\"#faad14\",\"#722ed1\",\"#13c2c2\"];const glyph={0:[\"111\",\"101\",\"101\",\"101\",\"101\",\"101\",\"111\"],1:[\"010\",\"110\",\"010\",\"010\",\"010\",\"010\",\"111\"],2:[\"111\",\"001\",\"001\",\"111\",\"100\",\"100\",\"111\"],3:[\"111\",\"001\",\"001\",\"111\",\"001\",\"001\",\"111\"],4:[\"101\",\"101\",\"101\",\"111\",\"001\",\"001\",\"001\"],5:[\"111\",\"100\",\"100\",\"111\",\"001\",\"001\",\"111\"],6:[\"111\",\"100\",\"100\",\"111\",\"101\",\"101\",\"111\"],7:[\"111\",\"001\",\"001\",\"010\",\"010\",\"010\",\"010\"],8:[\"111\",\"101\",\"101\",\"111\",\"101\",\"101\",\"111\"],9:[\"111\",\"101\",\"101\",\"111\",\"001\",\"001\",\"111\"]};const s=new Date().toTimeString().slice(0,8);const rows=Array.from({length:H},()=>Array(W).fill(off));let x=0,di=0;for(const ch of s){if(ch===\":\"){for(const y of [2,4])rows[y][x]=\"#333333\";x+=2;continue}const g=glyph[ch],on=colors[di++%colors.length];for(let y=0;y<H;y++)for(let dx=0;dx<3;dx++)if(g[y][dx]===\"1\")rows[y][x+dx]=on;x+=4}console.log(JSON.stringify({pixels:rows,time:s}))'"
          },
          "output": { "format": "json", "target": "/clock" },
          "policy": { "timeoutMs": 1000, "maxOutputBytes": 20000 }
        }
      ]
    }
  },
  {
    "surfaceUpdate": {
      "surfaceId": "pixel_clock",
      "components": [
        {
          "id": "display",
          "component": {
            "Grid": {
              "rows": 7,
              "cols": 27,
              "cellSize": 16,
              "gap": 0,
              "backgroundColor": "#ffffff",
              "cellBackgrounds": { "path": "/clock/pixels" }
            }
          }
        }
      ]
    }
  },
  {
    "beginRendering": {
      "surfaceId": "pixel_clock",
      "catalogId": "urn:a2ui:catalog:lark-card-live:v0_1",
      "root": "display"
    }
  }
]
```
