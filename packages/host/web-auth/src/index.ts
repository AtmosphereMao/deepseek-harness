/**
 * @deepseek-ai/dsh-host-web-auth — server-side password gate for the Web shell.
 * When a `password` is configured (typically `!!js process.env.DSH_WEB_PASSWORD`),
 * the plugin registers request and upgrade middleware on the webserver so that
 * every route, static asset, `/api` call, and WebSocket upgrade is refused until
 * the visitor presents the password at the inline login page. A correct login
 * sets an HttpOnly, SameSite=Strict session cookie that is valid for the
 * configured TTL; the token is a cryptographically random value held in process
 * memory. With no `password` the plugin is a no-op, preserving the existing
 * unauthenticated behavior.
 *
 * The password is compared in constant time (SHA-256 digests), and the login
 * page is self-contained, so an unauthenticated visitor never receives the boot
 * manifest, client bundles, or any `/api` data.
 * @module @deepseek-ai/dsh-host-web-auth
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { renderLoginPage } from './login-page.ts'

/** Stable Cordis plugin name. */
export const name = 'web-auth'

/** Service required before the gate can be mounted. */
export const inject = ['webServer']

/** Default session lifetime: 30 days, matching the requested UX. */
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Login route: GET renders the form, POST verifies the submitted password. */
const DEFAULT_LOGIN_PATH = '/__auth/login'

/** Session cookie name. */
const DEFAULT_COOKIE_NAME = 'dsh_web_session'

/** Upper bound on the login form body (only the password field is read). */
const MAX_PASSWORD_BODY_BYTES = 64 * 1024

/** Plugin config. */
export interface Config {
  /**
   * The plaintext gate password. Empty (the default, when
   * `process.env.DSH_WEB_PASSWORD` is unset) disables the gate entirely.
   */
  password: string
  /** Session cookie name. */
  cookieName: string
  /** Session lifetime in milliseconds. */
  sessionTtlMs: number
  /** Absolute pathname of the login route. */
  loginPath: string
}

export const Config: z<Config> = z.object({
  password: z.string().default(''),
  cookieName: z.string().default(DEFAULT_COOKIE_NAME),
  sessionTtlMs: z.natural().default(DEFAULT_SESSION_TTL_MS),
  loginPath: z.string().default(DEFAULT_LOGIN_PATH),
})

/** Read one cookie by name from a `Cookie` request header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim()
      return value === '' ? undefined : value
    }
  }
  return undefined
}

/** Constant-time password comparison over SHA-256 digests (equalizes length). */
export function verifyPassword(expectedDigest: Buffer, submitted: string): boolean {
  const submittedDigest = createHash('sha256').update(submitted).digest()
  return timingSafeEqual(expectedDigest, submittedDigest)
}

/** Read the `password` field from an `application/x-www-form-urlencoded` body. */
export async function readPasswordBody(req: IncomingMessage): Promise<string | undefined> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) return undefined
  const chunks: Buffer[] = []
  let size = 0
  // IncomingMessage's async iterator is typed `any`; narrow at the boundary so
  // the body assembly below stays type-safe.
  const body$ = req as AsyncIterable<Buffer | string>
  for await (const chunk of body$) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buf.length
    if (size > MAX_PASSWORD_BODY_BYTES) return undefined
    chunks.push(buf)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  const value = new URLSearchParams(body).get('password')
  return value === null ? undefined : value
}

/** Reject a WebSocket upgrade handshake with 401 before negotiation. */
export function rejectUpgrade(socket: Duplex): void {
  socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
  socket.destroy()
}

/**
 * Mount the gate.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const password = config.password
  if (password === '') return
  const cookieName = config.cookieName
  const sessionTtlMs = config.sessionTtlMs
  const loginPath = config.loginPath
  const passwordDigest = createHash('sha256').update(password).digest()
  // token -> absolute expiry epoch ms; single-process memory store.
  const sessions = new Map<string, number>()

  const isAuthenticated = (req: IncomingMessage): boolean => {
    const token = readCookie(req.headers.cookie, cookieName)
    if (token === undefined) return false
    const expiry = sessions.get(token)
    if (expiry === undefined) return false
    if (expiry < Date.now()) {
      sessions.delete(token)
      return false
    }
    return true
  }

  const serveLogin = (res: ServerResponse, status: number, error?: string): void => {
    const body = renderLoginPage(loginPath, error)
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    })
    res.end(body)
  }

  const setSessionCookie = (token: string): Record<string, string> => ({
    'set-cookie': `${cookieName}=${token}; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}; HttpOnly; SameSite=Strict`,
  })

  const redirectRoot = (res: ServerResponse, extraHeaders?: Record<string, string>): void => {
    res.writeHead(302, { location: '/', ...extraHeaders })
    res.end()
  }

  const pathnameOf = (req: IncomingMessage): string => new URL(req.url ?? '/', 'http://x').pathname

  ctx.effect(() => ctx.webServer.tapRequest(async (req, res, next) => {
    const pathname = pathnameOf(req)
    if (pathname === loginPath) {
      if (req.method === 'POST') {
        const submitted = await readPasswordBody(req)
        if (submitted !== undefined && verifyPassword(passwordDigest, submitted)) {
          const token = randomBytes(32).toString('base64url')
          sessions.set(token, Date.now() + sessionTtlMs)
          redirectRoot(res, setSessionCookie(token))
        } else {
          serveLogin(res, 401, '密码错误')
        }
      } else if (isAuthenticated(req)) {
        redirectRoot(res)
      } else {
        serveLogin(res, 200)
      }
      return
    }
    if (isAuthenticated(req)) {
      await next()
      return
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      serveLogin(res, 200)
    } else {
      res.writeHead(401)
      res.end('unauthorized')
    }
  }), 'web-auth: request gate')

  ctx.effect(() => ctx.webServer.tapUpgrade(async (req, socket, next) => {
    if (pathnameOf(req) === loginPath) {
      socket.destroy()
      return
    }
    if (isAuthenticated(req)) {
      await next()
      return
    }
    rejectUpgrade(socket)
  }), 'web-auth: upgrade gate')
}
