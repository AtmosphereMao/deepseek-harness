/**
 * Network settings plugin, browser half. It registers the Network settings
 * page and binds the `http` settings scope, whose durable section is owned by
 * `@deepseek-ai/dsh-http` on the Host plane. The proxy field commits through
 * the scope on Save; the transport applies the change on the next request.
 * Export discipline: packages/client/AGENTS.md.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry)
// plus the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
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
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on the slot through `slots.inject()`.
 * `connection` and `remote` are injected because `settingsScope.bind()` reads
 * both for its transport and forwarded settings invalidations.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

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
  const useSnapshot = bindSnapshotSelector(scope)

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
