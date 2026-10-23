# Hashmap builtins

Functions for hashmaps. They live in the `hashmap` module and are called with their qualified name: `m -> hashmap/at "a"`. A hashmap literal is `{"a": 1  "b": 2}`: `key: value` entries separated by whitespace, `{}` for an empty one.

- Hashmaps are mutable. `hashmap/put` and `hashmap/remove` change the hashmap in place and return the same hashmap, so a flow can keep going: `m -> hashmap/put "a" 1 -> hashmap/put "b" 2`. Every other function leaves its input untouched; `hashmap/merge`, `hashmap/map-values`, `hashmap/keep` and `hashmap/copy` return a new hashmap.
- Entries keep insertion order. `hashmap/keys`, `hashmap/values`, `hashmap/entries`, `hashmap/each` and printing walk the entries in the order they were first added; `hashmap/put` on an existing key keeps that key's position; a key that is removed and put back goes last.
- Keys may be any value and are compared structurally, like `=`: `[1 2]` finds an entry stored under another `[1 2]`, while `1` and `1.0` are different keys because they have different types.
- Mutating a key after it was inserted (for example a hashmap used as a key and later changed with `hashmap/put`) is undefined behavior: the entry may become unreachable or turn up under the wrong key.
- Every function here needs a hashmap as its input. Anything else is an error naming the function: `the input of \`hashmap/keys\` must be a hashmap, got an int`.

## hashmap/at

`hashmap -> hashmap/at key`

Returns the value stored under `key`. Use `hashmap/at-or` or `hashmap/has` when the key may be missing. Arrays and strings have their own `array/at` and `string/at`.

```
{"a": 1  "b": 2} -> hashmap/at "b" -> io/print-line      ~ 2
{[1 2]: "pair"} -> hashmap/at [1 2] -> io/print-line     ~ pair
```

Errors: `key` is not in the hashmap, as `key "zip" not found in hashmap` with the key in its `show` form.

## hashmap/at-or

`hashmap -> hashmap/at-or key default`

Returns the value stored under `key`, or `default` when the key is missing. A key stored with the value `nothing` is present, so `nothing` comes back rather than the default.

```
{"a": 1} -> hashmap/at-or "a" 0 -> io/print-line         ~ 1
{"a": 1} -> hashmap/at-or "zip" 0 -> io/print-line       ~ 0
```

## hashmap/put

`hashmap -> hashmap/put key value`

Stores `value` under `key` in place and returns the same hashmap. An existing key keeps its position and gets the new value; a new key goes last.

```
{"a": 1} => m
m -> hashmap/put "a" 10 -> hashmap/put "b" 2 -> io/print-line  ~ {"a": 10  "b": 2}
m -> io/print-line                                             ~ {"a": 10  "b": 2}
```

## hashmap/remove

`hashmap -> hashmap/remove key`

Deletes the entry under `key` in place and returns the same hashmap. Removing a key that is not there changes nothing.

```
{"a": 1  "b": 2} -> hashmap/remove "a" -> hashmap/remove "zip" -> io/print-line    ~ {"b": 2}
```

## hashmap/has

`hashmap -> hashmap/has key`

Returns `yes` when `key` is in the hashmap, `no` otherwise.

```
{"a": 1} -> hashmap/has "a" -> io/print-line             ~ yes
{"a": 1} -> hashmap/has "b" -> io/print-line             ~ no
```

## hashmap/keys

`hashmap -> hashmap/keys`

Returns the keys as an array, in insertion order.

```
{"b": 2  "a": 1} -> hashmap/keys -> io/print-line          ~ ["b" "a"]
```

## hashmap/values

`hashmap -> hashmap/values`

Returns the values as an array, in insertion order.

```
{"b": 2  "a": 1} -> hashmap/values -> io/print-line        ~ [2 1]
```

## hashmap/entries

`hashmap -> hashmap/entries`

Returns the entries as an array of two-element `[key value]` arrays, in insertion order. This is also how a hashmap becomes an array.

```
{"b": 2  "a": 1} -> hashmap/entries -> io/print-line       ~ [["b" 2] ["a" 1]]
```

## hashmap/length

`hashmap -> hashmap/length`

Returns the number of entries as an int.

```
{"a": 1  "b": 2} -> hashmap/length -> io/print-line        ~ 2
```

## hashmap/is-empty

`hashmap -> hashmap/is-empty`

Returns `yes` when the hashmap has no entries.

```
{} -> hashmap/is-empty -> io/print-line                  ~ yes
{"a": 1} -> hashmap/is-empty -> io/print-line            ~ no
```

## hashmap/merge

`hashmap -> hashmap/merge other`

Returns a new hashmap with the entries of both. The input's keys come first in their order, then the keys only `other` has; when a key is in both, the value from `other` wins. Neither input changes.

```
{"a": 1  "b": 2} -> hashmap/merge {"b": 20  "c": 3} -> io/print-line    ~ {"a": 1  "b": 20  "c": 3}
```

Errors: `other` is not a hashmap, as `the argument of \`hashmap/merge\` must be a hashmap, got an array`.

## hashmap/each

`hashmap -> hashmap/each key value | body`

Calls the body once per entry, in insertion order, with the key and the value as two arguments, and returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure. The loop walks the entries as they were when it started, so putting or removing inside the body does not change which entries are visited.

```
{"a": 1  "b": 2} -> hashmap/each k v
| "{k}={v}" -> io/print-line                               ~ a=1
                                                         ~ b=2
```

Errors: the body is not a procedure; the body does not take exactly two parameters.

## hashmap/map-values

`hashmap -> hashmap/map-values value | body`

Returns a new hashmap with the same keys in the same order, each value replaced by what the body returns for it. The input does not change.

```
{"a": 1  "b": 2} -> hashmap/map-values v | v * 10
-> io/print-line                                           ~ {"a": 10  "b": 20}
```

Errors: the body is not a procedure.

## hashmap/keep

`hashmap -> hashmap/keep key value | body`

Returns a new hashmap with the entries for which the body returns `yes`, in their original order. The input does not change. Arrays have their own `array/keep`.

```
{"a": 1  "b": 2  "c": 3} -> hashmap/keep k v | v > 1
-> io/print-line                                           ~ {"b": 2  "c": 3}
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`, as `the condition in \`hashmap/keep\` must return \`yes\` or \`no\`, got an int`.

## hashmap/copy

`hashmap -> hashmap/copy`

Returns a new hashmap with the same entries in the same order. The copy is shallow: keys and values are shared, so a value that is itself a hashmap or an array is the same one in both.

```
{"a": 1} => m
m -> hashmap/copy -> hashmap/put "b" 2 -> io/print-line  ~ {"a": 1  "b": 2}
m -> io/print-line                                       ~ {"a": 1}
```
