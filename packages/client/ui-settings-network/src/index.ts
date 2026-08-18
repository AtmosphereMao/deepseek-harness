/**
 * Host loader entry for the browser implementation exported from `./client`.
 * The network proxy settings page is browser-only; the durable `http` settings
 * namespace it writes is owned by `@deepseek-ai/dsh-http` on the Host plane.
 */

/** Host plugin body — no host-side behavior for the network settings plugin. */
export function apply(): void {}
