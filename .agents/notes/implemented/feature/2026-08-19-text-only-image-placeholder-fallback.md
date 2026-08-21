# Agent Note: Text-only models accept image blocks via placeholder fallback

Status: implemented

English | [中文](2026-08-19-text-only-image-placeholder-fallback.zh.md)

## Problem

A text-only route rejected every image-bearing prompt: the DeepSeek chat-completions adapter (which declares `inputModalities: ['text']`) failed at admission — `session.selectModel` refused a text-only target while images remained visible, and prompt admission returned `MODEL_DOES_NOT_SUPPORT_IMAGES` — while the pi-ai adapter threw `UNSUPPORTED_CONTENT` (`pi-ai model "..." does not support image input`) when serializing an image block for a text-only model. A user on such a route could not upload an image at all, even though a vision-capable model was reachable through a subagent.

## Decision

Accept image blocks on every route and let the wire adapter decide how to carry them. Neither serializer throws `UNSUPPORTED_CONTENT` for a text-only model: the DeepSeek serializer and the pi-ai text-only context each replace every image block with the text placeholder `[image attached: <name-or-mediaType> (attachmentId: <id>)]`, so a text-only model learns an image exists and can reference it by id. The subagent delegation tool (`tool-subagent`) gains an optional `image_attachment_ids` parameter: it resolves each id to its durable image block in the calling session log and injects those blocks into the child prompt, where a vision-capable child (for example pi-ai with `input: [text, image]`) renders them as real image content.

The durable log still records the image block; the placeholder is a serialize-time transform, so the model-visible ⟺ logged rule holds. api-proxy keeps the `serializeImageAdmission` chain as the image-admission ordering boundary, though its modality-rejection rationale is gone.

## Alternatives considered

- **Declare `input: [text, image]` on the main model and send base64** — reaches the main model directly, but the DeepSeek chat-completions wire is text-only and would reject the bytes; this works only for a pi-ai route, not the default DeepSeek route.
- **A dedicated `describe_image` tool on the main agent** — the tool runs in the text-only agent's context and cannot put an image in front of a model that cannot see it; it would still need a vision child.
- **Let a fork subagent inherit the uploaded image** — the fork seed ends at the last `turn/end`, and the uploaded image lives inside the in-flight turn after `turn/start`, so the seed cannot carry it without replaying an unbalanced turn.
- **Change the fork seed to include the current user message** — broadens every fork's semantics and replays an open `turn/start`, a larger invariant change than this feature needs.

## Consequences

Text routes may now carry image blocks in durable history; neither serializer sends image bytes to a text-only wire. `image_attachment_ids` is visible in the `subagent` and `subagent_fork` tool schemas, so every keyless snapshot pinning the tool catalog was refreshed. A vision subagent still requires a composition wiring `tool-subagent` to a vision-capable model (`agentOptions.provider`/`model`) and declaring `input: [text, image]` on that model. The ACP inbound-image gate remains a strict text-only rejection; relaxing it to match the Web path is a separate change.

## Related

- [Atomic Web image admission](../bug-fix/2026-07-29-atomic-web-image-admission.md) — the ordering chain this keeps; its text-only rejection is removed here.
- [pi-ai route default input modalities](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md) — how a vision child's `input` declaration resolves.
