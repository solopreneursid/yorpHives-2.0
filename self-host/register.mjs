import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const functionsRoot = new URL('../functions/', import.meta.url).href;
const authAdapter = new URL('./auth.mjs', import.meta.url).href;

// This hook is loaded only by the optional Node process. Nothing is bundled into
// Pages, and the original Cloudflare JWT verifier is never modified.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(functionsRoot) && specifier.startsWith('.')) {
      const candidate = new URL(specifier, context.parentURL);
      if (/\/functions\/_lib\/admin-auth(?:\.ts)?$/.test(candidate.pathname)) {
        return { url: authAdapter, shortCircuit: true };
      }
      if (!/\.[a-z]+$/i.test(candidate.pathname)) {
        for (const extension of ['.ts', '.js']) {
          const resolved = new URL(candidate.href + extension);
          if (existsSync(fileURLToPath(resolved))) return { url: resolved.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  }
});
