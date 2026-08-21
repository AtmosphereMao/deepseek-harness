# Agent Note: Composer subagent-model selector

Status: implemented

English | [中文](2026-08-19-subagent-model-selector.zh.md)

## Problem

Subagent model routing was fixed per composition through `tool-subagent`'s `agentOptions`, with no per-session choice. A text-only main route (DeepSeek chat-completions) cannot see images, so image recognition is delegated to a vision-capable child; the user needed to pick that child's model from the chat box, exactly like the main model, instead of whatever provider/model the composition hard-coded.

## Decision

A per-session subagent-model selection sits beside the existing main-model selection. api-proxy keeps a `WeakMap<Agent, SubagentModelSelectionRef>` (`subagentSelectionFor`), installed on the agent's scoped context through `dsh-agent`'s `installSubagentModelSelection`/`subagentModelOf`. `tool-subagent` reads `subagentModelOf(parent.ctx)` at spawn and, when one is selected, overrides `agentOptions.provider`/`model` while still inheriting the composition's `maxTokens`; no selection (or `null`) leaves the composition `agentOptions` untouched.

The wire gains `session.selectSubagentModel` (resolves the route through `ctx.llm.resolveCallConfig`, then records the selection; no default-save, no image-admission serialization) and a `subagent: ModelSelection | null` field on `session.models`. The composer's `conversation.input.model` seat adds a `子代理模型` pane between Model and Effort, submitting through the same per-session `ModelDirectory`. The `/model` popup still edits only the main model.

The selection is process-local (the main model's `picked` tier): it is not saved as a deployment default, so a restart reverts to inheriting `agentOptions`. A deployment without a Web model surface installs nothing, and the subagent tool keeps its composition config.

The registry is a module-level `WeakMap` keyed by the scoped `Context` in `dsh-agent`, not a `ctx.provide`d service. Sibling agents extend a shared owner context, so `ctx.provide('subagentModelSelection')` collides across them (`service "subagentModelSelection" has been registered at <root>`); the WeakMap sidesteps that scope sharing and releases the entry through the returned disposer.

## Alternatives considered

- **`ctx.provide` a service on the agent scope** — the natural Cordis seam, but sibling agents share the root isolate and the second `provide` of the same name throws; measured directly in a two-scope probe. The WeakMap registry is the same per-agent keying without the scope collision.
- **Save the subagent selection as a default (mirroring `session.selectModel`)** — a subagent route is a transient per-session preference, not a deployment default; persisting it would write a second settings section for a choice with no cross-session meaning, and the main model already owns the default gesture.
- **Edit the subagent model from the `/model` popup** — the user asked for the chat-box selector, and the composer seat is where the model route is chosen per conversation; keeping one popup main-model-only matches that surface.
- **Reuse `installModelSelection`'s prompt-assembly and request hooks for the subagent** — those hooks route the parent's own request; a subagent selection must not touch the parent's model, so only the readable ref is shared.

## Consequences

`session.models` gained `subagent`, so every typed `SessionsApi` stub and the replayed Web fixture carry the field; `ModelDirectory` state gained `subagent`, and the client selector gained a third pane. The selection is process-local and lost on restart, matching the main model's unpicked tier. A vision child still requires a composition wiring `tool-subagent` to a vision-capable model and declaring image input on that model; the selector only lets the user point that wiring at a different reachable route for this session.

## Related

- [Text-only models accept image blocks via placeholder fallback](2026-08-19-text-only-image-placeholder-fallback.md) — the vision-subagent delegation this selector routes.
