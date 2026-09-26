import type { Handler, Middleware } from './types.ts'

export function compose(middleware: readonly Middleware[], handler: Handler): Handler {
  return middleware.reduceRight<Handler>(
    (next, current) => (context) => current(context, () => next(context)),
    handler,
  )
}
