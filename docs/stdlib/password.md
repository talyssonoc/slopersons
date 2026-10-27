# Password builtins

The `password` module stores passwords safely: `password/hash` turns a password into text that can be saved, and `password/verify` checks a password someone types against that text. The saved text does not contain the password, and it cannot be turned back into it except by guessing, which the hash makes slow on purpose.

```
"correct horse" -> password/hash => stored
"correct horse" -> password/verify stored -> io/print-line   ~ yes
"wrong horse" -> password/verify stored -> io/print-line     ~ no
```

The hash is PBKDF2 with HMAC-SHA-256 and 600,000 iterations, the work factor the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) recommends for it, computed by Node's `crypto` module. Each call takes about 50 ms, during which the program does nothing else.

## hash

`password -> password/hash`

Returns the text to store, in the form `pbkdf2-sha256$600000$<salt>$<key>`: the scheme, the iteration count, a 16-byte salt drawn from the same secure source as [`string/random-hex`](string.md#random-hex) and the 32-byte derived key, both in lowercase hexadecimal. A new salt is drawn on every call, so hashing the same password twice gives different texts, and both verify.

```
"hunter2" -> password/hash -> io/print-line   ~ pbkdf2-sha256$600000$9f86d081884c7d659a2feaa0c55ad015$...
```

Errors: the input is not a string.

## verify

`password -> password/verify stored`

Returns `yes` when `password` is the one `stored` was made from, and `no` otherwise. It derives the key again with the iteration count, salt and key length written in `stored`, so texts stored before a change of iteration count keep working, and compares the keys in a time that does not depend on where they differ.

```
"passwd" -> password/verify "pbkdf2-sha256$1$73616c74$55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783" -> io/print-line   ~ yes
```

Errors: either input is not a string; `stored` is not in the form `password/hash` makes (`` the stored hash given to `password/verify` is not one `password/hash` makes ``), which includes an iteration count above 10,000,000.
