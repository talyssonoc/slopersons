# Hashmap builtins

Builtins for hashmaps. A hashmap literal is `{"a": 1  "b": 2}`: `key: value` entries separated by whitespace, `{}` for an empty one.

- Hashmaps are mutable. `put` and `remove` change the hashmap in place and return the same hashmap, so a flow can keep going: `m -> put "a" 1 -> put "b" 2`. Every other builtin leaves its input untouched; `merge`, `map-values`, `keep` and `copy` return a new hashmap.
- Entries keep insertion order. `keys`, `values`, `entries`, `each` and printing walk the entries in the order they were first added; `put` on an existing key keeps that key's position; a key that is removed and put back goes last.
- Keys may be any value and are compared structurally, like `=`: `[1 2]` finds an entry stored under another `[1 2]`, while `1` and `1.0` are different keys because they have different types.
- Mutating a key after it was inserted (for example a hashmap used as a key and later changed with `put`) is undefined behavior: the entry may become unreachable or turn up under the wrong key.

## at

`hashmap -> at key`

Returns the value stored under `key`. Use `at-or` or `has` when the key may be missing. Other types have their own `at`: see the array and string pages.

```
{"a": 1  "b": 2} -> at "b" -> print-ln        ~ 2
{[1 2]: "pair"} -> at [1 2] -> print-ln       ~ pair
```

Errors: `key` is not in the hashmap, as `key "zip" not found in hashmap` with the key in its `show` form.

## at-or

`hashmap -> at-or key default`

Returns the value stored under `key`, or `default` when the key is missing. A key stored with the value `nothing` is present, so `nothing` comes back rather than the default.

```
{"a": 1} -> at-or "a" 0 -> print-ln           ~ 1
{"a": 1} -> at-or "zip" 0 -> print-ln         ~ 0
```

## put

`hashmap -> put key value`

Stores `value` under `key` in place and returns the same hashmap. An existing key keeps its position and gets the new value; a new key goes last.

```
{"a": 1} => m
m -> put "a" 10 -> put "b" 2 -> print-ln      ~ {"a": 10  "b": 2}
m -> print-ln                                 ~ {"a": 10  "b": 2}
```

## remove

`hashmap -> remove key`

Deletes the entry under `key` in place and returns the same hashmap. Removing a key that is not there changes nothing.

```
{"a": 1  "b": 2} -> remove "a" -> remove "zip" -> print-ln    ~ {"b": 2}
```

## has

`hashmap -> has key`

Returns `yes` when `key` is in the hashmap, `no` otherwise.

```
{"a": 1} -> has "a" -> print-ln               ~ yes
{"a": 1} -> has "b" -> print-ln               ~ no
```

## keys

`hashmap -> keys`

Returns the keys as an array, in insertion order.

```
{"b": 2  "a": 1} -> keys -> print-ln          ~ ["b" "a"]
```

## values

`hashmap -> values`

Returns the values as an array, in insertion order.

```
{"b": 2  "a": 1} -> values -> print-ln        ~ [2 1]
```

## entries

`hashmap -> entries`

Returns the entries as an array of two-element `[key value]` arrays, in insertion order.

```
{"b": 2  "a": 1} -> entries -> print-ln       ~ [["b" 2] ["a" 1]]
```

## to-array

`hashmap -> to-array`

Same as `entries`. Other types have their own `to-array`: see the set page.

```
{"b": 2  "a": 1} -> to-array -> print-ln      ~ [["b" 2] ["a" 1]]
```

## length

`hashmap -> length`

Returns the number of entries as an int.

```
{"a": 1  "b": 2} -> length -> print-ln        ~ 2
```

## is-empty

`hashmap -> is-empty`

Returns `yes` when the hashmap has no entries.

```
{} -> is-empty -> print-ln                    ~ yes
{"a": 1} -> is-empty -> print-ln              ~ no
```

## merge

`hashmap -> merge other`

Returns a new hashmap with the entries of both. The input's keys come first in their order, then the keys only `other` has; when a key is in both, the value from `other` wins. Neither input changes.

```
{"a": 1  "b": 2} -> merge {"b": 20  "c": 3} -> print-ln    ~ {"a": 1  "b": 20  "c": 3}
```

Errors: `other` is not a hashmap.

## each

`hashmap -> each key value | body`

Calls the body once per entry, in insertion order, with the key and the value as two arguments, and returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure. The loop walks the entries as they were when it started, so putting or removing inside the body does not change which entries are visited.

```
{"a": 1  "b": 2} -> each k v
| "{k}={v}" -> print-ln                       ~ a=1
                                           ~ b=2
```

Errors: the body is not a procedure; the body does not take exactly two parameters.

## map-values

`hashmap -> map-values value | body`

Returns a new hashmap with the same keys in the same order, each value replaced by what the body returns for it. The input does not change.

```
{"a": 1  "b": 2} -> map-values v | v * 10
-> print-ln                                   ~ {"a": 10  "b": 20}
```

Errors: the body is not a procedure.

## keep

`hashmap -> keep key value | body`

Returns a new hashmap with the entries for which the body returns `yes`, in their original order. The input does not change. Other types have their own `keep`: see the array page.

```
{"a": 1  "b": 2  "c": 3} -> keep k v | v > 1
-> print-ln                                   ~ {"b": 2  "c": 3}
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`, as `the condition in \`keep\` must return \`yes\` or \`no\`, got an int`.

## copy

`hashmap -> copy`

Returns a new hashmap with the same entries in the same order. The copy is shallow: keys and values are shared, so a value that is itself a hashmap or an array is the same one in both.

```
{"a": 1} => m
m -> copy -> put "b" 2 -> print-ln            ~ {"a": 1  "b": 2}
m -> print-ln                                 ~ {"a": 1}
```
