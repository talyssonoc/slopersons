import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { failure, output } from '../helpers/run.ts';
import { scriptedRandomness } from '../helpers/fake-randomness.ts';

const SALT = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];

// RFC 7914, section 11: PBKDF2-HMAC-SHA256 of "passwd" with the salt "salt", 1 iteration, 64 bytes.
const RFC_7914_HASH = 'pbkdf2-sha256$1$73616c74$55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783';

test('password/hash derives a PBKDF2-HMAC-SHA256 key with 600000 iterations and a 16-byte random salt', () => {
  const expectedKey = pbkdf2Sync('hunter2 ✓', Buffer.from(SALT), 600_000, 32, 'sha256').toString('hex');
  assert.equal(
    output('"hunter2 ✓" -> password/hash -> io/print-line', { randomness: scriptedRandomness(SALT) }),
    `pbkdf2-sha256$600000$00112233445566778899aabbccddeeff$${expectedKey}\n`,
  );
});

test('password/hash draws a new salt each time, so the same password hashes differently', () => {
  const salts = [...SALT, ...SALT.map((byte) => 255 - byte)];
  assert.equal(output('("a" -> password/hash) = ("a" -> password/hash) -> io/print-line', { randomness: scriptedRandomness(salts) }), 'no\n');
});

test('password/verify accepts the password a hash was made from and refuses any other', () => {
  const source = '"hunter2" -> password/hash => stored\n"hunter2" -> password/verify stored -> io/print-line\n"Hunter2" -> password/verify stored -> io/print-line\n"" -> password/verify stored -> io/print-line';
  assert.equal(output(source, { randomness: scriptedRandomness(SALT) }), 'yes\nno\nno\n');
});

test('password/verify uses the iterations, salt and key length written in the stored hash', () => {
  assert.equal(output(`"passwd" -> password/verify "${RFC_7914_HASH}" -> io/print-line`), 'yes\n');
  assert.equal(output(`"passwd" -> password/verify "${RFC_7914_HASH.replace('$1$', '$2$')}" -> io/print-line`), 'no\n');
});

test('password/verify refuses a stored hash that password/hash could not have made', () => {
  const message = 'the stored hash given to `password/verify` is not one `password/hash` makes';
  for (const stored of ['plain', 'md5$1$aa$bb', 'pbkdf2-sha256$0$aa$bb', 'pbkdf2-sha256$01$aa$bb', 'pbkdf2-sha256$x$aa$bb', 'pbkdf2-sha256$99999999$aa$bb', 'pbkdf2-sha256$1$a$bb', 'pbkdf2-sha256$1$aa$', 'pbkdf2-sha256$1$AA$bb', 'pbkdf2-sha256$1$aa$bb$cc']) {
    assert.equal(failure(`"x" -> password/verify "${stored}"`).message, message, stored);
  }
});

test('password builtins name the input they reject', () => {
  assert.equal(failure('1 -> password/hash').message, 'the input of `password/hash` must be a string, got an int');
  assert.equal(failure('nothing -> password/verify "x"').message, 'the input of `password/verify` must be a string, got a nothing');
  assert.equal(failure('"x" -> password/verify 1').message, 'the stored hash given to `password/verify` must be a string, got an int');
  assert.equal(failure('"x" -> password/verify').message, '`password/verify` expects 2 arguments, got 1');
});
