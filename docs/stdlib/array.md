# Array builtins

Arrays are ordered, mutable sequences of any values, written `[1 "a" [2]]`. Indexes are ints starting at 0.

Five builtins change the array they receive and return that same array so a flow can keep going: `put`, `push`, `insert`, `remove-at`, and `pop`, which returns the removed element instead. Every other builtin on this page leaves its input untouched and returns a new array or a plain value. `copy` is the way to get an independent array before mutating.

Equality in `contains`, `index-of` and `unique` is structural, the same as `=`. Ordering in `sort`, `min` and `max` is the same as `<`: numbers with numbers, strings with strings, chars with chars, dates with dates, arrays element by element; mixing other types is an error.

Lambdas given to `map`, `keep` and the rest receive each element in turn. A `stop` inside such a lambda is not caught here; it leaves the innermost `while`, `each` or `repeat` around the call. `out` leaves the enclosing procedure as usual. An inline body such as `map n | n * 2` runs to the end of the line, so to keep flowing after it wrap the lambda in parentheses, `map (n | n * 2) -> print-ln`, or put the body on margin lines.

`each` over an array is documented on the core page.

## length

`array -> length`

Returns the number of elements as an int.

```
[1 2 3] -> length -> print-ln     ~ 3
```

## is-empty

`array -> is-empty`

Returns `yes` when the array has no elements.

```
[] -> is-empty -> print-ln        ~ yes
```

## at

`array -> at index`

Returns the element at `index`.

```
[10 20 30] -> at 1 -> print-ln    ~ 20
```

Errors: the index is not an int; the index is negative or not below the length (`index 5 is out of range for an array of length 3`).

## put

`array -> put index value`

Replaces the element at `index` in place and returns the same array.

```
[1 2 3] => xs
xs -> put 1 9
xs -> print-ln                    ~ [1 9 3]
```

Errors: the index is not an int; the index is out of range.

## push

`array -> push value`

Appends `value` in place and returns the same array.

```
[1] => xs
xs -> push 2 -> push 3
xs -> print-ln                    ~ [1 2 3]
```

## pop

`array -> pop`

Removes the last element in place and returns it.

```
[1 2 3] => xs
xs -> pop -> print-ln             ~ 3
xs -> print-ln                    ~ [1 2]
```

Errors: the array is empty (`cannot pop from an empty array`).

## insert

`array -> insert index value`

Inserts `value` before the element at `index` in place and returns the same array. An index equal to the length appends.

```
[1 3] => xs
xs -> insert 1 2 -> insert 3 4
xs -> print-ln                    ~ [1 2 3 4]
```

Errors: the index is not an int; the index is negative or greater than the length.

## remove-at

`array -> remove-at index`

Removes the element at `index` in place and returns the same array.

```
[1 2 3] -> remove-at 1 -> print-ln   ~ [1 3]
```

Errors: the index is not an int; the index is out of range.

## first

`array -> first`

Returns the first element.

```
[1 2 3] -> first -> print-ln      ~ 1
```

Errors: the array is empty.

## last

`array -> last`

Returns the last element.

```
[1 2 3] -> last -> print-ln       ~ 3
```

Errors: the array is empty.

## slice

`array -> slice start end`

Returns a new array with the elements from `start` up to but not including `end`. Both bounds are clamped to the array, so an `end` past the length means "to the end" and an `end` at or before `start` gives an empty array.

```
[1 2 3 4 5] -> slice 1 3 -> print-ln    ~ [2 3]
[1 2 3 4 5] -> slice 3 99 -> print-ln   ~ [4 5]
```

Errors: either bound is not an int.

## concat

`array -> concat other`

Returns a new array with the elements of `array` followed by those of `other`. Neither input changes.

```
[1 2] -> concat [3] -> print-ln   ~ [1 2 3]
```

Errors: `other` is not an array.

## flatten

`array -> flatten`

Returns a new array where each element that is itself an array is replaced by its elements. Only one level is removed; other elements are kept as they are.

```
[1 [2 [3]] [] 4] -> flatten -> print-ln   ~ [1 2 [3] 4]
```

## zip

`array -> zip other`

Returns a new array of two-element arrays pairing each element with the one at the same index in `other`, stopping at the shorter length.

```
[1 2 3] -> zip ["a" "b"] -> print-ln    ~ [[1 "a"] [2 "b"]]
```

Errors: `other` is not an array.

## contains

`array -> contains value`

Returns `yes` when some element is structurally equal to `value`.

```
[1 [2 3]] -> contains [2 3] -> print-ln   ~ yes
```

## index-of

`array -> index-of value`

Returns the index of the first element structurally equal to `value`, or `nothing` when there is none.

```
["a" "b"] -> index-of "b" -> print-ln     ~ 1
["a" "b"] -> index-of "z" -> print-ln     ~ nothing
```

## sum

`array -> sum`

Adds the elements with the rules of `+`: all ints give an int, any float promotes the result to a float. An empty array gives `0`.

```
[1 2 3] -> sum -> print-ln        ~ 6
[1 2.5] -> sum -> print-ln        ~ 3.5
```

Errors: an element is not an int or a float (`` `sum` needs an array of numbers, but found a string ``).

## min

`array -> min`

Returns the smallest element by value ordering. Among equal elements the first one wins.

```
[3 1 2] -> min -> print-ln        ~ 1
["b" "a"] -> min -> print-ln      ~ a
```

Errors: the array is empty; two elements cannot be compared.

## max

`array -> max`

Returns the largest element by value ordering. Among equal elements the first one wins.

```
[3 1 2] -> max -> print-ln        ~ 3
```

Errors: the array is empty; two elements cannot be compared.

## unique

`array -> unique`

Returns a new array keeping the first occurrence of each structurally distinct element, in order.

```
[1 2 1 3 2] -> unique -> print-ln     ~ [1 2 3]
[[1] [1] [2]] -> unique -> print-ln   ~ [[1] [2]]
```

## reverse

`array -> reverse`

Returns a new array with the elements in the opposite order.

```
[1 2 3] -> reverse -> print-ln    ~ [3 2 1]
```

## join

`array -> join separator`

Concatenates the elements, all of which must be strings, with `separator` between them. An empty array gives `""`.

```
["a" "b" "c"] -> join ", " -> print-ln   ~ a, b, c
```

Errors: the separator is not a string; an element is not a string (`` `join` needs an array of strings, but found an int ``).

## sort

`array -> sort`

Returns a new array in ascending value ordering. The sort is stable.

```
[3 1 2] -> sort -> print-ln           ~ [1 2 3]
["b" "a"] -> sort -> print-ln         ~ ["a" "b"]
```

Errors: two elements cannot be compared (`cannot compare an int with a string`).

## sort-by

`array -> sort-by a b | body`

Returns a new array ordered by the lambda, which receives two elements and returns `yes` when `a` should come before `b`. Elements that are neither before nor after each other keep their original order, so sorting records by one field preserves the order of ties.

```
[1 3 2] -> sort-by (a b | a > b) -> print-ln                                   ~ [3 2 1]
[["b" 2] ["a" 1] ["c" 2]] -> sort-by (a b | (a -> at 1) < (b -> at 1)) -> print-ln   ~ [["a" 1] ["b" 2] ["c" 2]]
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no` (`` the comparison in `sort-by` must return `yes` or `no`, got an int ``).

## map

`array -> map item | body`

Returns a new array of the body's result for each element.

```
[1 2 3] -> map (n | n * 2) -> print-ln     ~ [2 4 6]
```

Errors: the body is not a procedure.

## keep

`array -> keep item | body`

Returns a new array with the elements for which the body returns `yes`.

```
[1 2 3 4] -> keep (n | n mod 2 = 0) -> print-ln    ~ [2 4]
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no` (`` the condition in `keep` must return `yes` or `no`, got an int ``).

## reject

`array -> reject item | body`

Returns a new array with the elements for which the body returns `no`.

```
[1 2 3 4] -> reject (n | n mod 2 = 0) -> print-ln  ~ [1 3]
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## reduce

`array -> reduce initial acc item | body`

Calls the body with the accumulator and each element in turn, starting from `initial`, and returns the final accumulator. An empty array gives `initial`.

```
[1 2 3] -> reduce 0 (acc n | acc + n) -> print-ln  ~ 6
```

Errors: the body is not a procedure.

## any

`array -> any item | body`

Returns `yes` as soon as the body returns `yes` for an element, without calling it for the rest; `no` when no element matches, including for an empty array.

```
proc has-even xs
| xs -> any n
| | n mod 2 = 0
[1 3 4 5] -> has-even -> print-ln   ~ yes
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## all

`array -> all item | body`

Returns `no` as soon as the body returns `no` for an element, without calling it for the rest; `yes` when every element matches, including for an empty array.

```
proc all-small xs
| xs -> all n
| | n < 10
[1 2 3] -> all-small -> print-ln    ~ yes
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## find

`array -> find item | body`

Returns the first element for which the body returns `yes`, or `nothing` when there is none.

```
[1 2 3] -> find (n | n > 1) -> print-ln     ~ 2
[1 2 3] -> find (n | n > 5) -> print-ln     ~ nothing
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## count

`array -> count item | body`

Returns how many elements make the body return `yes`, as an int.

```
[1 2 3 4] -> count (n | n > 2) -> print-ln  ~ 2
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## with-index

`array -> with-index`

Returns a new array of `[index item]` pairs, so `each` over it sees positions as well as elements.

```
["a" "b"] -> with-index -> print-ln         ~ [[0 "a"] [1 "b"]]
["a" "b"] -> with-index -> each pair | "{pair -> at 0}:{pair -> at 1}" -> print-ln
~ 0:a
~ 1:b
```

## copy

`array -> copy`

Returns a new array with the same elements. The copy is shallow: nested arrays and hashmaps are shared with the original.

```
[1 2] => a
a -> copy => b
b -> push 3
a -> print-ln                     ~ [1 2]
b -> print-ln                     ~ [1 2 3]
```
