# Set builtins

Functions for sets. They live in the `set` module and are called with their qualified name: `s -> set/add 1`. There is no set literal: a set is built with `array/to-set` from an array. A set prints as `set[1 2 3]`.

- Sets are mutable. `set/add` and `set/remove` change the set in place and return the same set, so a flow can keep going: `s -> set/add 1 -> set/add 2`. Every other function leaves its input untouched; `set/union`, `set/intersect`, `set/difference` and `set/copy` return a new set.
- Elements keep insertion order. `set/to-array`, `set/each` and printing walk the elements in the order they were first added; adding an element that is already there changes nothing; an element that is removed and added back goes last.
- Elements may be any value and are compared structurally, like `=`: `[1 2]` is found by another `[1 2]`, while `1` and `1.0` are different elements because they have different types.
- Mutating an element after it was added (for example a hashmap in a set that is later changed with `hashmap/put`) is undefined behavior: the element may become unreachable or be reported missing.
- Every `set/*` function needs a set as its input. Anything else is an error naming the function: `the input of \`set/add\` must be a set, got an int`.

## array/to-set

`array -> array/to-set`

Builds a set from an array: duplicates collapse and each element keeps the position of its first occurrence. It only accepts an array; to duplicate a set use `set/copy`.

```
[3 1 3 2 1] -> array/to-set -> io/print-ln              ~ set[3 1 2]
[] -> array/to-set -> io/print-ln                       ~ set[]
```

Errors: the input is not an array, as `the input of \`array/to-set\` must be an array, got a set`.

## set/add

`set -> set/add value`

Adds `value` in place and returns the same set. Adding an element that is already there changes nothing.

```
[1] -> array/to-set => s
s -> set/add 2 -> set/add 1 -> io/print-ln              ~ set[1 2]
s -> io/print-ln                                        ~ set[1 2]
```

## set/remove

`set -> set/remove value`

Deletes `value` in place and returns the same set. Removing an element that is not there changes nothing.

```
[1 2 3] -> array/to-set -> set/remove 2 -> set/remove 9 -> io/print-ln    ~ set[1 3]
```

## set/has

`set -> set/has value`

Returns `yes` when `value` is in the set, `no` otherwise.

```
[[1 2] "a"] -> array/to-set -> set/has [1 2] -> io/print-ln    ~ yes
[[1 2] "a"] -> array/to-set -> set/has [2 1] -> io/print-ln    ~ no
```

## set/length

`set -> set/length`

Returns the number of elements as an int.

```
[1 1 2] -> array/to-set -> set/length -> io/print-ln    ~ 2
```

## set/is-empty

`set -> set/is-empty`

Returns `yes` when the set has no elements.

```
[] -> array/to-set -> set/is-empty -> io/print-ln       ~ yes
[1] -> array/to-set -> set/is-empty -> io/print-ln      ~ no
```

## set/union

`set -> set/union other`

Returns a new set with the elements of both: the input's elements in their order, then the elements only `other` has. Neither input changes.

```
[1 2 3] -> array/to-set -> set/union ([3 4] -> array/to-set) -> io/print-ln    ~ set[1 2 3 4]
```

Errors: `other` is not a set, as `the argument of \`set/union\` must be a set, got an array`.

## set/intersect

`set -> set/intersect other`

Returns a new set with the elements of the input that are also in `other`, in the input's order.

```
[1 2 3] -> array/to-set -> set/intersect ([3 4] -> array/to-set) -> io/print-ln    ~ set[3]
```

Errors: `other` is not a set.

## set/difference

`set -> set/difference other`

Returns a new set with the elements of the input that are not in `other`, in the input's order.

```
[1 2 3] -> array/to-set -> set/difference ([3 4] -> array/to-set) -> io/print-ln    ~ set[1 2]
```

Errors: `other` is not a set.

## set/to-array

`set -> set/to-array`

Returns the elements as an array, in insertion order.

```
[2 1 2] -> array/to-set -> set/to-array -> io/print-ln    ~ [2 1]
```

## set/each

`set -> set/each item | body`

Calls the body once per element, in insertion order, and returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure. The loop walks the elements as they were when it started, so adding or removing inside the body does not change which elements are visited.

```
[1 2 3] -> array/to-set -> set/each n | n -> io/print-ln    ~ 1
                                                            ~ 2
                                                            ~ 3
```

Errors: the body is not a procedure.

## set/copy

`set -> set/copy`

Returns a new set with the same elements in the same order. The copy is shallow: the elements themselves are shared.

```
[1] -> array/to-set => s
s -> set/copy -> set/add 2 -> io/print-ln               ~ set[1 2]
s -> io/print-ln                                        ~ set[1]
```
