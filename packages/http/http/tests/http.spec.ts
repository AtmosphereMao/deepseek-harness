import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import HttpTransport from '@deepseek-ai/dsh-http'

const NS = settingsNamespace('http')

let server: Server
let base: string
/** Every transport mounted in a test, disposed in `afterEach` so its process-wide dispatcher restoration always runs. */
const mounted: Context[] = []

beforeEach(async () => {
  server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  for (const ctx of mounted.reverse()) {
    await ctx.fiber.dispose()
  }
  mounted.length = 0
  await new Promise<void>(resolve => server.close(() => { resolve() }))
})

/** Mount a transport on a fresh root context (no settings provider → composition entry only). */
async function mount(config: ConstructorParameters<typeof HttpTransport>[1] = {}): Promise<{ ctx: Context; http: HttpTransport }> {
  const ctx = new Context()
  await ctx.plugin(HttpTransport, config)
  mounted.push(ctx)
  return { ctx, http: ctx.http }
}

/** Mount a transport over an in-memory settings provider, so the settings-scope layer is live. */
async function mountWithSettings(
  config: ConstructorParameters<typeof HttpTransport>[1] = {},
): Promise<{ ctx: Context; http: HttpTransport }> {
  const ctx = new Context()
  await ctx.plugin(MemorySettings)
  await ctx.plugin(HttpTransport, config)
  mounted.push(ctx)
  return { ctx, http: ctx.http }
}

/** Bind then close a server so its port is guaranteed to have no listener. */
async function closedPort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>(resolve => probe.close(() => { resolve() }))
  return port
}

/** The smallest real settings provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

describe('HttpTransport', () => {
  it('provides ctx.http and fetches directly when no proxy is configured', async () => {
    const { http } = await mount()
    const response = await http.fetch(`${base}/direct`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('rejects an unusable proxy scheme at load', async () => {
    await expect(mount({ proxy: 'ftp://127.0.0.1:21' })).rejects.toThrow(/http: or https:/)
  })

  it('rejects a malformed proxy URL at load', async () => {
    await expect(mount({ proxy: 'not a url' })).rejects.toThrow(/valid absolute URL/)
  })

  it('routes requests through the configured proxy', async () => {
    const port = await closedPort()
    const { http } = await mount({ proxy: `http://127.0.0.1:${port}` })
    // A direct request would reach the test server and resolve; the configured
    // proxy has no listener, so the request fails with a connection error.
    await expect(http.fetch(`${base}/proxied`)).rejects.toThrow()
  })

  it('routes the global fetch through the configured proxy', async () => {
    const port = await closedPort()
    await mount({ proxy: `http://127.0.0.1:${port}` })
    // SDK-backed consumers only know the global fetch; the proxy is installed
    // process-wide, so a bare global fetch must fail against the dead proxy.
    await expect(fetch(`${base}/sdk`)).rejects.toThrow()
  })

  it('restores the global fetch to direct transport after disposal', async () => {
    const port = await closedPort()
    const { ctx } = await mount({ proxy: `http://127.0.0.1:${port}` })
    await ctx.fiber.dispose()
    mounted.splice(mounted.indexOf(ctx), 1)
    // With the service gone, the process-wide dispatcher is back to default and
    // the bare global fetch reaches the test server directly.
    const response = await fetch(`${base}/restored`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('applies a settings-scope proxy change and clears it back to direct', async () => {
    const port = await closedPort()
    const { ctx, http } = await mountWithSettings()
    expect((await http.fetch(`${base}/before`)).status).toBe(200)

    // A settings write sets the proxy; the next request must hit the dead proxy.
    await ctx.settings.update(NS, { proxy: `http://127.0.0.1:${port}` })
    await expect(http.fetch(`${base}/proxied`)).rejects.toThrow()

    // Clearing the proxy restores direct transport for the next request.
    await ctx.settings.update(NS, { proxy: '' })
    expect((await http.fetch(`${base}/after`)).status).toBe(200)
  })
})
