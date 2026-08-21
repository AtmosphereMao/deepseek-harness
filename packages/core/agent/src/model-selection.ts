/**
 * Agent-scoped model selection shared by runtime entry points.
 * @module @deepseek-ai/dsh-agent/model-selection
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

/** Complete provider, model, and optional reasoning effort selected for one live Agent. */
export interface ModelSelection {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: ReasoningEffortId
}

/** Mutable model selection plus the value captured for the current step. */
export interface ModelSelectionRef {
  /** Model selected for the next step that enters prompt assembly. */
  current: ModelSelection | undefined
  /** Selection captured when the current step entered prompt assembly. */
  assembled: ModelSelection | undefined
}

/** Mutable model selection applied to subagents one live Agent spawns. */
export interface SubagentModelSelectionRef {
  /** Subagent model selected for the next child; undefined inherits the composition's `agentOptions`. */
  current: ModelSelection | undefined
}

// Per-agent-scope subagent-model selections, keyed by the scoped Context.
// Sibling agents extend a shared owner context, so a `ctx.provide` of one
// service name would collide across them; a WeakMap sidesteps that scope
// sharing while still releasing the entry with the returned disposer.
const subagentSelections = new WeakMap<Context, SubagentModelSelectionRef>()

/**
 * Couple one mutable selection to Agent-scoped prompt assembly and request routing.
 * Prompt assembly snapshots the selected model before delegating, then applies
 * its provider/model pair and effort to request config so a
 * concurrent switch takes effect on a later step instead of splitting the two
 * surfaces. An absent selected effort clears any inherited effort, restoring
 * the selected model's provider/default behavior.
 *
 * @param agentCtx - The selected Agent's scoped context.
 * @param selection - Mutable selection owned by the calling entry point.
 * @returns Disposer for both scoped waterfall listeners.
 */
export function installModelSelection(agentCtx: Context, selection: ModelSelectionRef): () => void {
  const disposeAssembly = agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const selected = selection.current
    const assembled = await next()
    selection.assembled = selected
    if (selected === undefined) return assembled
    return {
      ...assembled,
      variables: {
        ...assembled.variables,
        provider: selected.provider,
        model: selected.model,
      },
    }
  })
  const disposeRequest = agentCtx.on(
    'agent/request',
    async (_payload, next): Promise<LlmCallConfig> => {
      const resolved = await next()
      const selected = selection.assembled
      if (selected === undefined) return resolved
      const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved
      return {
        ...withoutInheritedEffort,
        provider: selected.provider,
        model: selected.model,
        ...selected.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selected.reasoningEffort },
      }
    },
  )
  return () => {
    disposeAssembly()
    disposeRequest()
  }
}

/**
 * Register a per-agent subagent-model selection readable through
 * {@link subagentModelOf}. Subagent tools read it to override their composition
 * `agentOptions`; a deployment without a Web model surface installs nothing, so
 * tools there keep inheriting their composition config unchanged.
 *
 * @param agentCtx - The selected Agent's scoped context.
 * @param selection - Mutable subagent-model selection owned by the calling entry point.
 * @returns Disposer that unregisters the selection.
 */
export function installSubagentModelSelection(agentCtx: Context, selection: SubagentModelSelectionRef): () => void {
  subagentSelections.set(agentCtx, selection)
  return () => {
    subagentSelections.delete(agentCtx)
  }
}

/**
 * Read the subagent model selected for one Agent's delegations, if any.
 * @param agentCtx - The selected Agent's scoped context.
 * @returns The selected subagent model, or `undefined` when nothing is selected.
 */
export function subagentModelOf(agentCtx: Context): ModelSelection | undefined {
  return subagentSelections.get(agentCtx)?.current
}
