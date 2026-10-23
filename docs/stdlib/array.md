# Array builtins

Arrays are ordered, mutable sequences of any values, written `[1 "a" [2]]`. Indexes are ints starting at 0.

The functions on this page live in the `array` module and are called by their qualified name, `[1 2 3] -> array/length`, with no `use` needed. A program that leans on one of them can bind it to a shorter name: `array/map => map`.

Five functions change the array they receive and return that same array so a flow can keep going: `array/put`, `array/push`, `array/insert`, `array/remove-at`, and `array/pop`, which returns the removed element instead. Every other function on this page leaves its input untouched and returns a new array or a plain value. `array/copy` is the way to get an independent array before mutating.

Equality in `array/contains`, `array/index-of` and `array/unique` is structural, the same as `=`. Ordering in `array/sort`, `array/min` and `array/max` is the same as `<`: numbers with numbers, strings with strings, chars with chars, dates with dates, arrays element by element; mixing other types is an error.

Lambdas given to `array/each`, `array/map`, `array/keep` and the rest receive each element in turn. A `stop` inside such a lambda is not caught here; it leaves the innermost `while`, `array/each` or `int/times` around the call. `out` leaves the enclosing procedure as usual. An inline body such as `array/map n | n * 2` runs to the end of the line, so to keep flowing after it either wrap the lambda in parentheses, `array/map (n | n * 2) -> io/print-line`, or continue the flow on the next line with a leading `->`.

## length

`array -> array/length`

Returns the number of elements as an int.

```
[1 2 3] -> array/length -> io/print-line     ~ 3
```

## is-empty

`array -> array/is-empty`

Returns `yes` when the array has no elements.

```
[] -> array/is-empty -> io/print-line        ~ yes
```

## at

`array -> array/at index`

Returns the element at `index`.

```
[10 20 30] -> array/at 1 -> io/print-line    ~ 20
```

Errors: the index is not an int; the index is negative or not below the length (`index 5 is out of range for an array of length 3`).

## put

`array -> array/put index value`

Replaces the element at `index` in place and returns the same array.

```
[1 2 3] => xs
xs -> array/put 1 9
xs -> io/print-line                          ~ [1 9 3]
```

Errors: the index is not an int; the index is out of range.

## push

`array -> array/push value`

Appends `value` in place and returns the same array.

```
[1] => xs
xs -> array/push 2 -> array/push 3
xs -> io/print-line                          ~ [1 2 3]
```

## pop

`array -> array/pop`

Removes the last element in place and returns it.

```
[1 2 3] => xs
xs -> array/pop -> io/print-line           ~ 3
xs -> io/print-line                        ~ [1 2]
```

Errors: the array is empty (`cannot pop from an empty array`).

## insert

`array -> array/insert index value`

Inserts `value` before the element at `index` in place and returns the same array. An index equal to the length appends.

```
[1 3] => xs
xs -> array/insert 1 2 -> array/insert 3 4
xs -> io/print-line                          ~ [1 2 3 4]
```

Errors: the index is not an int; the index is negative or greater than the length.

## remove-at

`array -> array/remove-at index`

Removes the element at `index` in place and returns the same array.

```
[1 2 3] -> array/remove-at 1 -> io/print-line   ~ [1 3]
```

Errors: the index is not an int; the index is out of range.

## first

`array -> array/first`

Returns the first element.

```
[1 2 3] -> array/first -> io/print-line      ~ 1
```

Errors: the array is empty.

## last

`array -> array/last`

Returns the last element.

```
[1 2 3] -> array/last -> io/print-line       ~ 3
```

Errors: the array is empty.

## slice

`array -> array/slice start end`

Returns a new array with the elements from `start` up to but not including `end`. Both bounds are clamped to the array, so an `end` past the length means "to the end" and an `end` at or before `start` gives an empty array.

```
[1 2 3 4 5] -> array/slice 1 3 -> io/print-line   ~ [2 3]
[1 2 3 4 5] -> array/slice 3 99 -> io/print-line  ~ [4 5]
```

Errors: either bound is not an int.

## concat

`array -> array/concat other`

Returns a new array with the elements of `array` followed by those of `other`. Neither input changes.

```
[1 2] -> array/concat [3] -> io/print-line   ~ [1 2 3]
```

Errors: `other` is not an array.

## flatten

`array -> array/flatten`

Returns a new array where each element that is itself an array is replaced by its elements. Only one level is removed; other elements are kept as they are.

```
[1 [2 [3]] [] 4] -> array/flatten -> io/print-line   ~ [1 2 [3] 4]
```

## zip

`array -> array/zip other`

Returns a new array of two-element arrays pairing each element with the one at the same index in `other`, stopping at the shorter length.

```
[1 2 3] -> array/zip ["a" "b"] -> io/print-line    ~ [[1 "a"] [2 "b"]]
```

Errors: `other` is not an array.

## contains

`array -> array/contains value`

Returns `yes` when some element is structurally equal to `value`.

```
[1 [2 3]] -> array/contains [2 3] -> io/print-line   ~ yes
```

## index-of

`array -> array/index-of value`

Returns the index of the first element structurally equal to `value`, or `nothing` when there is none.

```
["a" "b"] -> array/index-of "b" -> io/print-line   ~ 1
["a" "b"] -> array/index-of "z" -> io/print-line   ~ nothing
```

## sum

`array -> array/sum`

Adds the elements with the rules of `+`: all ints give an int, any float promotes the result to a float. An empty array gives `0`.

```
[1 2 3] -> array/sum -> io/print-line      ~ 6
[1 2.5] -> array/sum -> io/print-line      ~ 3.5
```

Errors: an element is not an int or a float (`` `array/sum` needs an array of numbers, but found a string ``).

## min

`array -> array/min`

Returns the smallest element by value ordering. Among equal elements the first one wins. To take the smaller of two numbers use `math/min`.

```
[3 1 2] -> array/min -> io/print-line      ~ 1
["b" "a"] -> array/min -> io/print-line    ~ a
```

Errors: the array is empty; two elements cannot be compared.

## max

`array -> array/max`

Returns the largest element by value ordering. Among equal elements the first one wins. To take the larger of two numbers use `math/max`.

```
[3 1 2] -> array/max -> io/print-line        ~ 3
```

Errors: the array is empty; two elements cannot be compared.

## unique

`array -> array/unique`

Returns a new array keeping the first occurrence of each structurally distinct element, in order.

```
[1 2 1 3 2] -> array/unique -> io/print-line    ~ [1 2 3]
[[1] [1] [2]] -> array/unique -> io/print-line  ~ [[1] [2]]
```

## reverse

`array -> array/reverse`

Returns a new array with the elements in the opposite order.

```
[1 2 3] -> array/reverse -> io/print-line    ~ [3 2 1]
```

## join

`array -> array/join separator`

Concatenates the elements, all of which must be strings, with `separator` between them. An empty array gives `""`.

```
["a" "b" "c"] -> array/join ", " -> io/print-line   ~ a, b, c
```

Errors: the separator is not a string; an element is not a string (`` `array/join` needs an array of strings, but found an int ``).

## sort

`array -> array/sort`

Returns a new array in ascending value ordering. The sort is stable.

```
[3 1 2] -> array/sort -> io/print-line         ~ [1 2 3]
["b" "a"] -> array/sort -> io/print-line       ~ ["a" "b"]
```

Errors: two elements cannot be compared (`cannot compare an int with a string`).

## sort-by

`array -> array/sort-by a b | body`

Returns a new array ordered by the lambda, which receives two elements and returns `yes` when `a` should come before `b`. Elements that are neither before nor after each other keep their original order, so sorting records by one field preserves the order of ties.

```
[1 3 2] -> array/sort-by (a b | a > b) -> io/print-line                                                 ~ [3 2 1]
[["b" 2] ["a" 1] ["c" 2]] -> array/sort-by (a b | (a -> array/at 1) < (b -> array/at 1)) -> io/print-line   ~ [["a" 1] ["b" 2] ["c" 2]]
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no` (`` the comparison in `array/sort-by` must return `yes` or `no`, got an int ``).

## each

`array -> array/each item | body`

Calls the body once per element, in order, and returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure. Other types have their own `each`: `string/each`, `hashmap/each` and `set/each`.

```
[1 2 3] -> array/each n
| n * 10 -> io/print-line
~ 10
~ 20
~ 30
```

Errors: the input is not an array; the body is not a procedure.

## map

`array -> array/map item | body`

Returns a new array of the body's result for each element.

```
[1 2 3] -> array/map (n | n * 2) -> io/print-line   ~ [2 4 6]
[1 2 3] -> array/map n | n + 1
-> io/print-line                             ~ [2 3 4]
```

Errors: the body is not a procedure.

## keep

`array -> array/keep item | body`

Returns a new array with the elements for which the body returns `yes`.

```
[1 2 3 4] -> array/keep (n | n mod 2 = 0) -> io/print-line    ~ [2 4]
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no` (`` the condition in `array/keep` must return `yes` or `no`, got an int ``).

## reject

`array -> array/reject item | body`

Returns a new array with the elements for which the body returns `no`.

```
[1 2 3 4] -> array/reject (n | n mod 2 = 0) -> io/print-line  ~ [1 3]
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## reduce

`array -> array/reduce initial acc item | body`

Calls the body with the accumulator and each element in turn, starting from `initial`, and returns the final accumulator. An empty array gives `initial`.

```
[1 2 3] -> array/reduce 0 (acc n | acc + n) -> io/print-line  ~ 6
```

Errors: the body is not a procedure.

## any

`array -> array/any item | body`

Returns `yes` as soon as the body returns `yes` for an element, without calling it for the rest; `no` when no element matches, including for an empty array.

```
proc has-even xs
| xs -> array/any n
| | n mod 2 = 0
[1 3 4 5] -> has-even -> io/print-line       ~ yes
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## all

`array -> array/all item | body`

Returns `no` as soon as the body returns `no` for an element, without calling it for the rest; `yes` when every element matches, including for an empty array.

```
proc all-small xs
| xs -> array/all n
| | n < 10
[1 2 3] -> all-small -> io/print-line        ~ yes
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## find

`array -> array/find item | body`

Returns the first element for which the body returns `yes`, or `nothing` when there is none.

```
[1 2 3] -> array/find (n | n > 1) -> io/print-line   ~ 2
[1 2 3] -> array/find (n | n > 5) -> io/print-line   ~ nothing
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## count

`array -> array/count item | body`

Returns how many elements make the body return `yes`, as an int.

```
[1 2 3 4] -> array/count (n | n > 2) -> io/print-line  ~ 2
```

Errors: the body is not a procedure; the body returns something other than `yes` or `no`.

## with-index

`array -> array/with-index`

Returns a new array of `[index item]` pairs, so `array/each` over it sees positions as well as elements.

```
["a" "b"] -> array/with-index -> io/print-line         ~ [[0 "a"] [1 "b"]]
["a" "b"] -> array/with-index -> array/each pair | "{pair -> array/at 0}:{pair -> array/at 1}" -> io/print-line
~ 0:a
~ 1:b
```

## copy

`array -> array/copy`

Returns a new array with the same elements. The copy is shallow: nested arrays and hashmaps are shared with the original.

```
[1 2] => a
a -> array/copy => b
b -> array/push 3
a -> io/print-line                         ~ [1 2]
b -> io/print-line                         ~ [1 2 3]
```
