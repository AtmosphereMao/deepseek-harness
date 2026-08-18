/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-settings-network`.
 * @module @deepseek-ai/dsh-client-ui-settings-network/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-settings-network'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-network-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this presentation page owns no independent event
 * sequence or mutable-data relation — it writes one field through the `http`
 * settings scope, whose durable section and transport behavior are owned by
 * `@deepseek-ai/dsh-http`, and its render state is covered by the component
 * specs.
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
