/**
 * Service Definition + local provider for the shared HTTP transport seam
 * (`ctx.http`). It is the one place every outbound product request — the
 * DeepSeek chat adapter, the anonymous web fetcher, and the search providers —
 * goes through, so one shared transport configuration (currently the HTTP(S)
 * proxy) reaches every consumer without per-consumer duplication.
 *
 * The seam's three roles live here together on purpose: the Definition
 * (`ctx.http` + {@link HttpTransport.fetch}) and the Provider (the Node HTTP
 * stack) cannot evolve independently because there is exactly one local
 * transport, and there is no provider registry to select among — unlike the
 * web seam, which exists to choose one of several search/fetch backends.
 * Consumers that call {@link HttpTransport.fetch} directly are
 * `dsh-llm-deepseek`, `dsh-llm-pi-ai` (catalog discovery), and the
 * `dsh-web-*` providers. The proxy is also installed as the process-wide
 * undici dispatcher so SDK-backed consumers — the pi-ai library's chat
 * providers, which reach the network through the global `fetch` — route
 * through it too.
 *
 * The proxy is a durable `http:` user-settings section layered over this
 * plugin's composition entry, so a change written by the Network settings
 * page reaches the very next request without restarting anything.
 * @module @deepseek-ai/dsh-http
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import { getGlobalDispatcher, ProxyAgent, setGlobalDispatcher } from 'undici'

/** Durable settings namespace carrying the shared transport configuration. */
const NS = 'http'

/**
 * Shared transport configuration, validated by {@link HttpTransport.Config}
 * and doubling as the `http:` settings-section shape. Every field is optional:
 * an omitted proxy means direct (no proxy) transport.
 */
export interface HttpTransportConfig {
  /**
   * HTTP(S) proxy URL applied to every outbound request, e.g.
   * `http://127.0.0.1:7890`. Empty or absent disables proxying. SOCKS is not
   * supported. The URL may carry credentials (`http://user:pass@host:port`),
   * which are stored in the same user-owned settings document as the rest of
   * the section and are NOT redacted on the settings wire.
   */
  proxy?: string
}

/** The transport fetch face consumers call instead of the global `fetch`. */
export type HttpFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

declare module '@deepseek-ai/cordis' {
  interface Context {
    http: HttpTransport
  }
}

/** Reject a proxy the provider could not act on (a URL beyond the schema's reach). */
function assertUsableProxy(value: HttpTransportConfig): void {
  const proxy = value.proxy?.trim()
  if (proxy === undefined || proxy === '') return
  let parsed: URL
  try {
    parsed = new URL(proxy)
  } catch (error: unknown) {
    throw new Error('http: proxy must be a valid absolute URL', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`http: proxy must use http: or https:, got ${parsed.protocol}`)
  }
}

/**
 * The shared HTTP transport service. Provides {@link HttpTransport.fetch},
 * which applies the currently resolved proxy (when one is configured) as an
 * undici dispatcher on every request and otherwise defers to the global
 * `fetch`. The same proxy is also installed as undici's process-wide
 * dispatcher, so SDK-backed consumers that only know the global `fetch` route
 * through it as well. The proxy dispatcher is rebuilt only when the resolved
 * proxy URL changes, so steady-state requests never pay construction cost.
 */
export class HttpTransport extends Service {
  static Config: z<HttpTransportConfig> = z.object({
    proxy: z.string(),
  })

  /** Current resolved configuration source (composition entry or settings scope). */
  private current: () => HttpTransportConfig
  /** The proxy URL the cached dispatcher was built from (trimmed). */
  private proxyUrl = ''
  /** Lazily rebuilt undici proxy dispatcher; undefined means direct transport. */
  private dispatcher: ProxyAgent | undefined
  /** The process-wide dispatcher undici had before this service took over. */
  private readonly defaultDispatcher = getGlobalDispatcher()

  /**
   * @param ctx - the providing plugin's context (owns `ctx.http`).
   * @param config - composition entry, used as the settings `base` layer.
   */
  constructor(ctx: Context, config: HttpTransportConfig) {
    super(ctx, 'http')
    this.current = () => config
    this.refreshProxy()
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, NS, HttpTransport.Config, config, {
        setSource: (source) => { this.current = source },
        onChange: () => { this.refreshProxy() },
        validate: assertUsableProxy,
      })
    })
    // Restore the process-wide dispatcher (and drop the pool) when this service
    // is disposed, so a stop or reload leaves the global fetch as it found it.
    ctx.effect(() => () => { this.restoreGlobalProxy() })
  }

  /**
   * Perform one outbound request through the shared transport. Identical to
   * the global `fetch` except that a configured proxy dispatcher is applied.
   * @param input - the request URL (or a Request).
   * @param init - standard fetch options (method, headers, body, signal, redirect, ...).
   * @returns the standard fetch `Response`.
   */
  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const dispatcher = this.dispatcher
    if (dispatcher === undefined) return fetch(input, init)
    // `dispatcher` is undici's Node-fetch extension, absent from the DOM-lib
    // `RequestInit` the global fetch is typed against; the runtime (undici)
    // honors it as the connection dispatcher.
    return fetch(input, { ...init, dispatcher } as RequestInit & { dispatcher: ProxyAgent })
  }

  /** Rebuild the cached proxy dispatcher when the resolved proxy URL changed. */
  private refreshProxy(): void {
    const config = this.current()
    // The settings `validate` hook guards writes; this re-check also covers the
    // composition entry when no settings provider mounted, so an unusable proxy
    // fails loud at load instead of surfacing as a bare ProxyAgent throw.
    assertUsableProxy(config)
    const proxy = config.proxy?.trim() ?? ''
    if (proxy === this.proxyUrl) return
    this.proxyUrl = proxy
    this.dispatcher = proxy === '' ? undefined : new ProxyAgent(proxy)
    this.applyGlobalProxy()
  }

  /**
   * Install the resolved proxy as undici's process-wide dispatcher. SDK-backed
   * consumers reach the network through the global `fetch`, which the
   * per-request dispatcher in {@link HttpTransport.fetch} cannot cover; the
   * global dispatcher can. Direct consumers are unaffected because a
   * per-request dispatcher overrides the global one.
   */
  private applyGlobalProxy(): void {
    setGlobalDispatcher(this.dispatcher ?? this.defaultDispatcher)
  }

  /** Restore the dispatcher undici had before this service, and drop the pool. */
  private restoreGlobalProxy(): void {
    setGlobalDispatcher(this.defaultDispatcher)
    void this.dispatcher?.close()
    this.dispatcher = undefined
  }
}

export default HttpTransport
