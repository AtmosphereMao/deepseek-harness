/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-http`.
 * @module @deepseek-ai/dsh-http/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-http'

/** Cordis companion plugin name. */
export const name = 'http-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this transport owns no independent event sequence or
 * mutable-data relation — its only state is the proxy-dispatcher cache, which
 * is rebuilt from the resolved `http` settings section and covered by this
 * package's own unit tests, and the `http` settings namespace itself is owned
 * by the settings seam.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
