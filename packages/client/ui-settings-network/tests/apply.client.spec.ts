/** What the browser half registers, and that it all leaves with the fiber. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-settings-network/client'
import type { NetworkSectionInjected } from '@deepseek-ai/dsh-client-ui-settings-network/client'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('remote', { $on: vi.fn(() => () => {}) } as never)
  const mutate = vi.fn(() => Promise.resolve({ rpcId: 'm', result: { ok: false, error: {} } }))
  ctx.provide('connection', {
    isLoopback: true,
    api: {
      settings: {
        describe: vi.fn(() => Promise.resolve({ rpcId: 's', result: { ok: false, error: {} } })),
        mutate,
      },
    },
  } as never)
  await ctx.plugin(SettingsScopeBinder).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, mutate }
}

function declareRoot(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-network apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers one Network section', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = slots.entries('settings.section')[0]!
    expect(section.options).toMatchObject({ id: 'network', order: 5 })
    expect(resolveSlotLabel(section.options.label)).toBe('网络')
  })

  it('injects a face that writes a proxy through the scope', async () => {
    const { ctx, slots, mutate } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = slots.entries('settings.section')[0]!
    const face = (section.inject as unknown as () => NetworkSectionInjected)()
    expect(face.t('nav')).toBe('网络')
    expect(face.t('proxyLabel')).toBe('代理地址')

    face.setProxy('http://127.0.0.1:9999')
    await vi.waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
        ns: 'http',
        ops: [{ op: 'set', path: ['proxy'], value: 'http://127.0.0.1:9999' }],
      }))
    })
  })

  it('clears the proxy through the scope on an empty value', async () => {
    const { ctx, slots, mutate } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = slots.entries('settings.section')[0]!
    const face = (section.inject as unknown as () => NetworkSectionInjected)()

    face.setProxy('')
    await vi.waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
        ns: 'http',
        ops: [{ op: 'unset', path: ['proxy'] }],
      }))
    })
  })

  it('registers into a declaration that arrives after apply', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()

    declareRoot(slots)

    await vi.waitFor(() => { expect(slots.entries('settings.section')).toHaveLength(1) })
  })

  it('collapses every contribution on teardown', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('settings.section')).toHaveLength(1)

    await fiber.dispose()

    expect(slots.entries('settings.section')).toHaveLength(0)
  })
})
