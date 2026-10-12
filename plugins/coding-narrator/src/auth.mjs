import { createRemoteJWKSet, jwtVerify } from 'jose';

function httpsUrl(value, name) {
  if (!value) throw new Error(`${name} is required for hosted mode.`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error(`${name} must be a clean HTTPS URL.`);
  return url;
}

export function createHostedAuth(env = process.env, { verify = jwtVerify, jwks } = {}) {
  const origin = httpsUrl(env.NARRATOR_PUBLIC_ORIGIN, 'NARRATOR_PUBLIC_ORIGIN');
  if (origin.pathname !== '/') throw new Error('NARRATOR_PUBLIC_ORIGIN must be an origin without a path.');
  httpsUrl(env.NARRATOR_AUTH_ISSUER, 'NARRATOR_AUTH_ISSUER');
  // JWT issuer identifiers are exact strings; URL normalization changes their identity.
  const issuer = env.NARRATOR_AUTH_ISSUER;
  const keysUrl = httpsUrl(env.NARRATOR_AUTH_JWKS_URL, 'NARRATOR_AUTH_JWKS_URL');
  if (!env.NARRATOR_AUTH_AUDIENCE) throw new Error('NARRATOR_AUTH_AUDIENCE is required.');
  const allowedSubjects = new Set((env.NARRATOR_ALLOWED_SUBJECTS ?? '').split(',').map(value => value.trim()).filter(Boolean));
  // Personal deployment has an explicit owner allowlist, independently of OAuth scopes.
  if (!allowedSubjects.size) throw new Error('NARRATOR_ALLOWED_SUBJECTS is required for this personal deployment.');
  const keys = jwks ?? createRemoteJWKSet(keysUrl, { timeoutDuration: 5000, cooldownDuration: 30000 });
  return {
    origin: origin.origin,
    metadata: {
      resource: `${origin.origin}/mcp`, authorization_servers: [issuer],
      scopes_supported: ['narrate'], bearer_methods_supported: ['header'], resource_name: 'Coding Narrator',
    },
    async authorize(req) {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ') || header.length > 12000) throw new Error('Authentication required.');
      const { payload } = await verify(header.slice(7), keys, {
        issuer, audience: env.NARRATOR_AUTH_AUDIENCE,
        algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '2h',
      });
      if (!allowedSubjects.has(payload.sub) || !(payload.scope ?? '').split(' ').includes('narrate')) throw new Error('Narration access denied.');
      return payload.sub;
    },
  };
}
