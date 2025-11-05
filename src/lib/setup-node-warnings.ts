/*
 * Suppress the noisy Node.js warning about the deprecated `Buffer()` constructor.
 * Some third-party dependencies still call it, which triggers the DEP0005 warning
 * on every cold start. We intercept `process.emitWarning` and drop just that code
 * while allowing every other warning to flow through normally.
 */

const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = (warning: unknown, ...args: unknown[]) => {
  const code =
    typeof warning === 'object' && warning !== null && 'code' in (warning as Record<string, unknown>)
      ? (warning as Record<string, unknown>).code
      : typeof args[1] === 'string'
        ? args[1]
        : typeof args[0] === 'string'
          ? args[0]
          : undefined;

  const message = typeof warning === 'string' ? warning : undefined;

  if (code === 'DEP0005' || message?.includes('Buffer() is deprecated')) {
    return;
  }

  originalEmitWarning(warning as any, ...(args as any));
};
