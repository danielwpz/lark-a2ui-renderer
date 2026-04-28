---
name: lark-a2ui-author
description: Generate, validate, and interpret A2UI v0.8 JSON for the lark-a2ui-renderer Feishu/Lark card subset. Use when an agent needs to author Lark-card A2UI messages, check whether generated A2UI JSON is valid, or handle normalized userAction replies from Lark card interactions.
---

# Lark A2UI Author

Use this skill to work with the `lark-a2ui-renderer` A2UI v0.8 subset.

## Workflow

1. Author A2UI server messages, not Feishu/Lark Card JSON.
2. Read [references/protocol.md](references/protocol.md) for message structure,
   supported components, bindings, and Lark-specific adaptations.
3. Use [references/examples.md](references/examples.md) for compact examples.
4. Validate generated JSON with the bundled script:

```bash
node skills/scripts/validate-a2ui.js --version v0_8 path/to/a2ui.messages.json
```

5. For user replies, reason from A2UI `userAction` events. Do not expose raw
   Feishu/Lark callback payloads to application logic or an LLM.
