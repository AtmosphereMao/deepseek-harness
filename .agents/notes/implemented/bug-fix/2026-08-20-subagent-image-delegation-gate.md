# Agent Note: Image delegation is gated by a provider capability and taught in the prompt

Status: implemented

English | [中文](2026-08-20-subagent-image-delegation-gate.zh.md)

## Problem

[Text-only image placeholder fallback](../feature/2026-08-19-text-only-image-placeholder-fallback.md) built the whole delegation path — a text route serializes each image as `[image attached: … (attachmentId: …)]`, and `tool-subagent`'s `image_attachment_ids` resolves those ids back to durable image blocks for the child — and [the subagent-model selector](../feature/2026-08-19-subagent-model-selector.md) let the user point that child at a vision route from the composer. The mechanism worked, yet a session asked "what is in this image" still dead-ended: the model read the placeholder, called `read_image`, received `switch to an image-capable model to read images`, and told the user to switch models. It had the attachmentId and the delegation tool in the same request and connected neither, because nothing model-visible said the placeholder was delegable. The `image_attachment_ids` parameter description named the syntax, but a model only reads a parameter description after it has already decided to call that tool.

The same surface also broke the seam's own "fail loud, no silent degradation" rule. Image delivery was not a declared capability, so `assertCapabilities` could not check it: `subagent-acp`'s `toAcpPrompt` dropped every non-text block on the floor, and the Codex and Claude Code task builders threw a generic "must contain only text blocks" from inside the provider. The previous note recorded the ACP drop as a known asymmetry to fix separately.

## Decision

**`SubagentCapabilities` gains `imagePrompt`, and the service checks it against prompt content.** The flag states that a provider delivers non-text blocks to the child unchanged. `assertCapabilities` adds `{ when: request.prompt.some(block => block.type === 'image'), cap: 'imagePrompt' }`, so an image-bearing prompt aimed at a text-only wire is rejected at `start` with `UNSUPPORTED_CAPABILITY` instead of arriving without its picture. This flag is keyed off `prompt` content rather than a named option — the one asymmetry among the sibling flags, documented at the declaration, and the reason it is a capability rather than a provider-local throw is that the tool layer must be able to ask before dispatching.

The in-process providers (`spawn`, `fork`) declare `imagePrompt: true` because they hand `request.prompt` to the child verbatim. Every out-of-process backend declares `false` through the shared `NO_START_CAPABILITIES`, which ACP now uses in place of its own inline literal — that literal drifting from the shared constant is what let the ACP drop survive the previous change.

**The capability drives what the model is told, not just what the service permits.** `image_attachment_ids` appears in the tool schema only when the mounted provider declares `imagePrompt`, and a forced key on a text-only instance is refused in `execute` — schema omission is advertising, so the opt-out needs execution-time enforcement, the same stance `run_in_background` already takes. The `tool:<toolName>` prompt section, previously registered only for continuable background mode, now always registers and composes the clauses its instance earns; an `imagePrompt` provider adds one telling the model that a placeholder carries an image it cannot see, to pass the id as `image_attachment_ids`, and to report what the child says rather than guessing or asking the user to switch models.

**`read_image`'s refusal names delegation first.** It now reads `does not declare image input. To look at this image, delegate to a subagent on an image-capable model … Otherwise switch this session to an image-capable model.` The strict route gate itself is unchanged: a text route still never commits an image block to its own history.

## Alternatives considered

- **A dedicated auto-delegating tool (`describe_image`) that starts a vision child internally** — one call, deterministic, no reliance on the model connecting two facts. Rejected as the wrong first move: it adds a package, a tool schema, and a second delegation path whose boundary against `read_image` and `subagent` needs explaining, to solve what turned out to be missing guidance. The transcript that motivated this note shows the model *wanting* to look at the image and having every means to; it needed to be told, not routed around. If guidance proves unreliable in practice, this stays the fallback and nothing here blocks it.
- **Gate the guidance on `inheritsParentContext === false`** — the first attempt, and wrong: ACP, Codex, Claude Code, and the SDK provider all declare `false` while carrying no images, so the guidance would have advertised delegation on providers where `start` now rejects it. Discovering that the existing flags could not express "carries images" is what produced `imagePrompt`.
- **Keep the guidance in the `subagent` tool description only** — cheaper than a prompt section and already partly there, but a tool description is read after the tool is chosen, which is exactly the step that never happened. Both surfaces now carry it; the prompt section is the one that reaches a model still deciding.
- **Let each provider keep throwing on a non-text block** — no new capability, and Codex already did this. Rejected because the failure lands after the tool call is logged, the message names the provider's internal task builder rather than the choice the caller made, and the tool cannot omit a parameter it has no way to test.
- **One shared prompt section for all delegation tools** — avoids repeating the image clause once per capable tool (`subagent` and `subagent_fork` both carry it). Rejected because section names are unique per registration and each instance owns its own tool name, which the clause must name to be actionable; the clause was tightened instead.

## Consequences

`SubagentCapabilities` gained a required member, so every provider, test double, and the tool-catalog generator declares it — the compiler named all 55 sites, which is the fail-loud stance working as intended. A composition over an out-of-process provider loses `image_attachment_ids` from that tool's schema; `product-subagent-codex` pins exactly this, with the parameter present on `subagent`/`subagent_fork` and absent on `subagent_codex`.

The image clause is emitted once per capable delegation tool, so a composition loading both `subagent` and `subagent_fork` pays for it twice. That is real prompt cost, accepted because the clause must name its tool.

A vision child still needs a route that declares `image` input. This is the sharpest remaining edge, and it is configuration rather than code: per [pi-ai route default input modalities](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md), modalities resolve entry `input` → installed catalog → route `defaultInput` → `[text]`, so a hand-declared provider whose model entries carry only `id` reports text-only. Such a child receives the placeholder instead of pixels and answers that it cannot see images — the delegation succeeds and reports nothing useful, which reads like a harness failure but is one missing `input: [text, image]` line. Nothing in the harness can detect it, because no OpenAI-compatible endpoint reports its modalities.

## Testing

`tool-subagent.spec.ts` covers the three new decisions: the schema omitting `image_attachment_ids` on a text-only provider, `execute` refusing a forced key there, and the prompt section carrying the image clause only while the provider declares `imagePrompt`. `service.spec.ts` extends the existing capability-rejection table with an image-bearing prompt, proving the seam rejects before `start`. `read-image.spec.ts` pins the refusal naming delegation. The four provider suites assert their own declared capability sets, so a provider silently flipping the flag fails.

Keyless snapshots carry the assembled result: the recorded system prompts show the clause naming each capable tool, and the codex scenario proves an incapable provider advertises neither the parameter nor the guidance.

## Related

- [Text-only models accept image blocks via placeholder fallback](../feature/2026-08-19-text-only-image-placeholder-fallback.md) — built the path this makes reachable; its deferred ACP inbound-image asymmetry is closed here.
- [Composer subagent-model selector](../feature/2026-08-19-subagent-model-selector.md) — points the child at a vision route per session.
- [pi-ai route default input modalities](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md) — why an undeclared model is text-only, and the one line that fixes it.
- [A minimal read_image tool over existing seams](../feature/2026-08-10-minimal-read-image-tool.md) — deferred the delegated-viewing story its refusal now names.
