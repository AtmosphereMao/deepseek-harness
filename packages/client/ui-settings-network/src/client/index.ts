/**
 * Network settings plugin, browser half. It registers the Network settings
 * page and binds the `http` settings scope, whose durable section is owned by
 * `@deepseek-ai/dsh-http` on the Host plane. The proxy field commits through
 * the scope on Save; the transport applies the change on the next request.
 * Export discipline: packages/client/AGENTS.md.
 */

import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry)
// plus the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the slot system's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { NetworkSection } from './NetworkSection.tsx'
import type { NetworkSectionInjected, NetworkSettings } from './NetworkSection.tsx'
import { en, zh, type NetworkKey } from './locales.ts'

export type { NetworkSectionInjected, NetworkSectionProps, NetworkSettings } from './NetworkSection.tsx'
export type { NetworkKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Network settings section's copy. */
    'settings.network': NetworkKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.network'

/**
 * Bind the settings scope to a typed selector hook over React's
 * `useSyncExternalStore`. A plugin bundle resolves externals against the
 * platform static module table, which carries `react` but not the renderer
 * package that owns the shared binder, so the hook is constructed here.
 * `subscribe`/`getSnapshot` are captured once per source into stable closures
 * so components never resubscribe across renders. The optional equality
 * argument is accepted for signature compatibility and unused: the scope
 * replaces its snapshot reference only on change, so identity is already the
 * change signal.
 * @param source - the settings scope, read as a bare observable snapshot source.
 * @returns the selector hook consumed by the section component.
 */
function bindScopeSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  const subscribe = (fn: () => void): (() => void) => source.subscribe(fn)
  const getSnapshot = (): T => source.getSnapshot()
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(subscribe, getSnapshot))
  }
}

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on the slot through `slots.inject()`.
 * `settingsScope` injects its own `remote`/`remote.settings` transport.
 */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Register the `settings.network` dictionaries and the Network section once
 * the `settings.section` declaration is on the ledger, binding its `http`
 * settings scope for reads and writes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-network: copy dictionaries')

  const t = ctx.locale.bind(NS) as NetworkSectionInjected['t']
  const scope = ctx.settingsScope.bind<NetworkSettings>({ namespace: 'http' })
  const useSnapshot = bindScopeSelector(scope)

  const injected = (): NetworkSectionInjected => ({
    useSnapshot,
    t,
    setProxy: (value) => {
      const trimmed = value.trim()
      if (trimmed === '') {
        void scope.unset('proxy')
        return
      }
      void scope.set('proxy', trimmed)
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'network',
    order: 5,
    label: () => t('nav'),
    inject: injected,
  }, NetworkSection))
}
