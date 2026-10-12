import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { createHostedAuth } from '../src/auth.mjs';

test('hosted startup requires authentication and validates signature, owner, audience, expiry and scope', async () => {
  assert.throws(() => createHostedAuth({}));
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const env = {
    NARRATOR_PUBLIC_ORIGIN: 'https://narrator.example.org', NARRATOR_AUTH_ISSUER: 'https://auth.example.org/',
    NARRATOR_AUTH_JWKS_URL: 'https://auth.example.org/keys', NARRATOR_AUTH_AUDIENCE: 'narrator', NARRATOR_ALLOWED_SUBJECTS: 'owner',
  };
  const auth = createHostedAuth(env, { jwks: publicKey });
  const token = async (subject = 'owner', scope = 'narrate', audience = 'narrator', expiry = '1h') => new SignJWT({ scope }).setProtectedHeader({ alg: 'ES256' }).setIssuer(env.NARRATOR_AUTH_ISSUER).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const req = async (...args) => ({ headers: { authorization: `Bearer ${await token(...args)}` } });
  assert.equal(await auth.authorize(await req()), 'owner');
  await assert.rejects(auth.authorize({ headers: {} }));
  await assert.rejects(auth.authorize(await req('other')));
  await assert.rejects(auth.authorize(await req('owner', 'other')));
  await assert.rejects(auth.authorize(await req('owner', 'narrate', 'wrong')));
  await assert.rejects(auth.authorize(await req('owner', 'narrate', 'narrator', '-1h')));
  assert.equal(auth.metadata.resource, 'https://narrator.example.org/mcp');
});

test('issuer without a trailing slash is matched exactly rather than normalized', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const env = {
    NARRATOR_PUBLIC_ORIGIN: 'https://narrator.example.org', NARRATOR_AUTH_ISSUER: 'https://auth.example.org',
    NARRATOR_AUTH_JWKS_URL: 'https://auth.example.org/keys', NARRATOR_AUTH_AUDIENCE: 'narrator', NARRATOR_ALLOWED_SUBJECTS: 'owner',
  };
  const auth = createHostedAuth(env, { jwks: publicKey });
  const token = issuer => new SignJWT({ scope: 'narrate' }).setProtectedHeader({ alg: 'ES256' })
    .setIssuer(issuer).setAudience('narrator').setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  assert.equal(await auth.authorize({ headers: { authorization: `Bearer ${await token(env.NARRATOR_AUTH_ISSUER)}` } }), 'owner');
  await assert.rejects(auth.authorize({ headers: { authorization: `Bearer ${await token(env.NARRATOR_AUTH_ISSUER + '/')}` } }));
  assert.deepEqual(auth.metadata.authorization_servers, [env.NARRATOR_AUTH_ISSUER]);
});
