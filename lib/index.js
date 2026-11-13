/**
 * Host half of the balance badge.
 *
 * The badge is browser copy only: the client half reads the balance through the
 * existing account Remote methods and renders it in the sidebar footer. The host
 * entry exists so the Loader has a row to mount and the client module system has
 * a package to publish a bundle for.
 */

/** Loader display name. */
export const name = 'balance-badge'

/** No host service or configuration is required. */
export function apply() {}
