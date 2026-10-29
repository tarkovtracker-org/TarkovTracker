// @vitest-environment node
/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'));
const serverRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server/package.json'));
const nitroRequire = createRequire(serverRequire.resolve('nitropack/package.json'));
const listhenRequire = createRequire(nitroRequire.resolve('listhen'));
const forge = listhenRequire('node-forge');
// Public upstream regression technique: e=1 makes this synthetic signature equal
// to the encoded message. These are test values, never real RSA keys.
const publicKey = forge.pki.rsa.setPublicKey(
  new forge.jsbn.BigInteger('f'.repeat(256), 16),
  new forge.jsbn.BigInteger('1', 10)
);
const digest = forge.md.sha256.create().update('hello world!').digest().getBytes();
const oid = '0609608648016503040201';
const digestHex = `0420${forge.util.bytesToHex(digest)}`;
function verify(digestInfo: string, expectedDigest = digest) {
  const padding = 'ff'.repeat(128 - 3 - digestInfo.length / 2);
  return publicKey.verify(expectedDigest, forge.util.hexToBytes(`0001${padding}00${digestInfo}`));
}
describe('listhen node-forge security', () => {
  it.each([
    ['extra DigestAlgorithm element', `3033300f${oid}05000400${digestHex}`],
    ['NULL parameters with content', `3033300f${oid}0502beef${digestHex}`],
    ['non-minimal DigestInfo length', `308131300d${oid}0500${digestHex}`],
  ])('rejects %s during RSA verification', (_name, value) => {
    expect(() => verify(value)).toThrow(/DigestInfo/);
  });
  it.each([
    ['with NULL parameters', `3031300d${oid}0500${digestHex}`],
    ['without NULL parameters', `302f300b${oid}${digestHex}`],
  ])('preserves canonical RSA verification %s', (_name, value) => {
    expect(verify(value)).toBe(true);
    expect(verify(value, '\x00'.repeat(32))).toBe(false);
  });
  it('preserves local self-signed certificate and PEM round trips', () => {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 1024 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(0);
    cert.validity.notAfter = new Date('2100-01-01T00:00:00Z');
    cert.setSubject([{ name: 'commonName', value: 'localhost' }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const decoded = forge.pki.certificateFromPem(forge.pki.certificateToPem(cert));
    expect(decoded.verify(decoded)).toBe(true);
    expect(decoded.subject.getField('CN').value).toBe('localhost');
    const privateKey = forge.pki.privateKeyFromPem(forge.pki.privateKeyToPem(keys.privateKey));
    expect(privateKey.n.compareTo(keys.publicKey.n)).toBe(0);
  });
});
