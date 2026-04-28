# Fixtures

Fixtures define semantic behavior shared by future language implementations.
They intentionally do not include invented raw Feishu/Lark callback payloads.

Each fixture may include:

- `a2ui.messages.json`: A2UI v0.8 messages produced by an agent.
- `normalized-callback-input.json`: Callback data after a platform extractor
  has pulled out the renderer envelope and form values.
- `expected-user-action.json`: Expected A2UI v0.8 client-to-server event.

When the raw Feishu/Lark callback shape is verified against official examples
or real payloads, additional `raw-lark-callback.json` fixtures can be added.
