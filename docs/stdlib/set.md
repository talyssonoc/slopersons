# Set builtins

Builtins for sets. There is no set literal: a set is built with `to-set` from an array. A set prints as `set[1 2 3]`.

- Sets are mutable. `add` and `remove` change the set in place and return the same set, so a flow can keep going: `s -> add 1 -> add 2`. Every other builtin leaves its input untouched; `union`, `intersect`, `difference` and `copy` return a new set.
- Elements keep insertion order. `to-array`, `each` and printing walk the elements in the order they were first added; adding an element that is already there changes nothing; an element that is removed and added back goes last.
- Elements may be any value and are compared structurally, like `=`: `[1 2]` is found by another `[1 2]`, while `1` and `1.0` are different elements because they have different types.
- Mutating an element after it was added (for example a hashmap in a set that is later changed with `put`) is undefined behavior: the element may become unreachable or be reported missing.

## to-set

`array -> to-set` or `set -> to-set`

Builds a set from an array: duplicates collapse and each element keeps the position of its first occurrence. On a set it returns a copy.

```
[3 1 3 2 1] -> to-set -> print             ~ set[3 1 2]
[] -> to-set -> print                      ~ set[]
```

Errors: the input is neither an array nor a set.

## add

`set -> add value`

Adds `value` in place and returns the same set. Adding an element that is already there changes nothing.

```
[1] -> to-set => s
s -> add 2 -> add 1 -> print               ~ set[1 2]
s -> print                                 ~ set[1 2]
```

## remove

`set -> remove value`

Deletes `value` in place and returns the same set. Removing an element that is not there changes nothing.

```
[1 2 3] -> to-set -> remove 2 -> remove 9 -> print    ~ set[1 3]
```

## has

`set -> has value`

Returns `yes` when `value` is in the set, `no` otherwise.

```
[[1 2] "a"] -> to-set -> has [1 2] -> print    ~ yes
[[1 2] "a"] -> to-set -> has [2 1] -> print    ~ no
```

## contains

`set -> contains value`

Same as `has`, so sets, arrays and strings can all be asked with one name.

```
[1 2] -> to-set -> contains 2 -> print     ~ yes
```

## length

`set -> length`

Returns the number of elements as an int.

```
[1 1 2] -> to-set -> length -> print       ~ 2
```

## is-empty

`set -> is-empty`

Returns `yes` when the set has no elements.

```
[] -> to-set -> is-empty -> print          ~ yes
[1] -> to-set -> is-empty -> print         ~ no
```

## union

`set -> union other`

Returns a new set with the elements of both: the input's elements in their order, then the elements only `other` has. Neither input changes.

```
[1 2 3] -> to-set -> union ([3 4] -> to-set) -> print    ~ set[1 2 3 4]
```

Errors: `other` is not a set.

## intersect

`set -> intersect other`

Returns a new set with the elements of the input that are also in `other`, in the input's order.

```
[1 2 3] -> to-set -> intersect ([3 4] -> to-set) -> print    ~ set[3]
```

Errors: `other` is not a set.

## difference

`set -> difference other`

Returns a new set with the elements of the input that are not in `other`, in the input's order.

```
[1 2 3] -> to-set -> difference ([3 4] -> to-set) -> print    ~ set[1 2]
```

Errors: `other` is not a set.

## to-array

`set -> to-array`

Returns the elements as an array, in insertion order.

```
[2 1 2] -> to-set -> to-array -> print     ~ [2 1]
```

## each

`set -> each item | body`

Calls the body once per element, in insertion order, and returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure. The loop walks the elements as they were when it started, so adding or removing inside the body does not change which elements are visited.

```
[1 2 3] -> to-set -> each n | n -> print   ~ 1
                                           ~ 2
                                           ~ 3
```

Errors: the body is not a procedure.

## copy

`set -> copy`

Returns a new set with the same elements in the same order. The copy is shallow: the elements themselves are shared.

```
[1] -> to-set => s
s -> copy -> add 2 -> print                ~ set[1 2]
s -> print                                 ~ set[1]
```
