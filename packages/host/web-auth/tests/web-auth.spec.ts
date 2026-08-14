/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the webserver and web-auth rows, and every assertion
 * observes the served HTTP surface — the login page for unauthenticated
 * visitors, the password-check/redirect/cookie flow, authenticated passthrough,
 * upgrade rejection, and the no-op when no password is configured.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import HttpServer from '@deepseek-ai/dsh-host-webserver'
import * as WebAuth from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot a webserver + web-auth composition with the given password. */
async function loadComposition(password: string): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-web-auth-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    '- id: web-auth',
    "  name: '@deepseek-ai/dsh-host-web-auth'",
    '  config:',
    `    password: '${password}'`,
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', HttpServer],
    ['@deepseek-ai/dsh-host-web-auth', WebAuth],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

async function request(port: number, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${String(port)}${path}`, init)
}

/** POST the login form; returns the raw (non-followed) response. */
async function login(port: number, password: string): Promise<Response> {
  return request(port, '/__auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }),
    redirect: 'manual',
  })
}

function sessionToken(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? ''
  const match = /dsh_web_session=([^;]+)/.exec(setCookie)
  expect(match).not.toBeNull()
  return match![1]!
}

describe('real Loader composition', () => {
  it('gates every route until the correct password is entered', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition('secret')
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    const server = loaded.webServer
    const port = server.port
    server.register({ kind: 'exact', path: '/ok', handler: (_req, res) => { res.writeHead(200); res.end('OK') } })

    // Unauthenticated navigation renders the login page (never the app).
    const anon = await request(port, '/')
    expect(anon.status).toBe(200)
    expect(await anon.text()).toContain('输入访问密码')
    expect((await (await request(port, '/ok')).text())).toContain('输入访问密码')

    // Unauthenticated non-GET is refused.
    expect((await request(port, '/ok', { method: 'POST' })).status).toBe(401)

    // Wrong password re-renders the login page with an error; no cookie set.
    const wrong = await login(port, 'nope')
    expect(wrong.status).toBe(401)
    expect(await wrong.text()).toContain('密码错误')
    expect(wrong.headers.get('set-cookie')).toBeNull()

    // Correct password redirects home and sets an HttpOnly session cookie.
    const good = await login(port, 'secret')
    expect(good.status).toBe(302)
    expect(good.headers.get('location')).toBe('/')
    const token = sessionToken(good)
    expect(good.headers.get('set-cookie')).toContain('HttpOnly')
    expect(good.headers.get('set-cookie')).toContain('SameSite=Strict')

    // With the cookie the gate passes: the app route is reachable.
    const authed = await request(port, '/ok', { headers: { cookie: `dsh_web_session=${token}` } })
    expect(authed.status).toBe(200)
    expect(await authed.text()).toBe('OK')

    // A bogus token is not accepted.
    const bogus = await request(port, '/ok', { headers: { cookie: 'dsh_web_session=bogus' } })
    expect(bogus.status).toBe(200)
    expect(await bogus.text()).toContain('输入访问密码')

    // WebSocket upgrades are rejected without a session cookie.
    const socket = connect(port, '127.0.0.1')
    socket.on('error', () => { /* server-side rejection is the fixture outcome */ })
    await once(socket, 'connect')
    const data = once(socket, 'data')
    socket.write([
      'GET /upgrade HTTP/1.1',
      `Host: 127.0.0.1:${String(port)}`,
      'Connection: Upgrade',
      'Upgrade: dsh-test',
      '',
      '',
    ].join('\r\n'))
    const [buf] = await data as [Buffer]
    expect(String(buf)).toContain('401 Unauthorized')
    socket.destroy()
  })

  it('is a no-op when no password is configured', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition('')
    const server = loaded.webServer
    const port = server.port
    server.register({ kind: 'exact', path: '/ok', handler: (_req, res) => { res.writeHead(200); res.end('OK') } })
    const response = await request(port, '/ok')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
  })
})
