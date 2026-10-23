# Time

A `time` is a time of day with millisecond precision: hours, minutes, seconds and milliseconds since midnight. Times are immutable and carry no date and no time zone. There is no literal; build one with `time` or `to-time`, or take one from a datetime with `-> time`. Times print as `HH:MM:SS`, with `.SSS` appended only when the milliseconds are not zero. `<`, `=` and the other comparison operators work between two times.

## time

`hour -> time minute second` or `hour -> time minute second millisecond`

Builds a time from its components.

```
12 -> time 30 0 -> print-ln        ~ 12:30:00
9 -> time 5 7 42 -> print-ln       ~ 09:05:07.042
```

Errors: a component is not an int; the components do not form a valid time, reported as `25:00:00 is not a valid time`.

## to-time

`text -> to-time`

Parses `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff` with one to three fraction digits.

```
"12:30" -> to-time -> print-ln      ~ 12:30:00
"12:30:15.5" -> to-time -> print-ln ~ 12:30:15.500
```

Errors: the text is not in one of those forms, reported as `cannot convert "12h30" to a time`.

## hour, minute, second, millisecond

`time -> hour`, `time -> minute`, `time -> second`, `time -> millisecond`

Each component as an int.

```
9 -> time 5 7 42 -> minute -> print-ln   ~ 5
```

## to-milliseconds

`time -> to-milliseconds`

Milliseconds since midnight as an int.

```
0 -> time 0 1 500 -> to-milliseconds -> print-ln   ~ 1500
```

## add-hours, add-minutes, add-seconds, add-milliseconds

`time -> add-hours count` and likewise for the other units

Shifts the time by a whole number of units, which may be negative. A time has no date, so the result wraps around midnight.

```
23 -> time 30 0 -> add-hours 2 -> print-ln      ~ 01:30:00
0 -> time 10 0 -> add-minutes -20 -> print-ln   ~ 23:50:00
```

Errors: the count is not an int; the count is beyond a thousand million million, reported as `hour count N is out of range`.

## milliseconds-between, seconds-between

`start -> milliseconds-between end`, `start -> seconds-between end`

The difference `end` minus `start` within one day, negative when `end` is earlier. Seconds are floored.

```
(9 -> time 0 0) -> seconds-between (10 -> time 30 0) -> print-ln   ~ 5400
```

Errors: the end is not a time.

## format

`time -> format pattern`

Renders the time with these tokens; any other character is copied.

| Token | Meaning |
| --- | --- |
| `HH` | hour, two digits |
| `H` | hour |
| `MM` | minute, two digits |
| `M` | minute |
| `SS` | second, two digits |
| `S` | second |
| `SSS` | millisecond, three digits |

The time tokens are uppercase so they can share a pattern with the lowercase date tokens: `mm` is the month and `MM` the minute.

```
9 -> time 5 7 42 -> format "H:MM" -> print-ln          ~ 9:05
9 -> time 5 7 42 -> format "HH:MM:SS.SSS" -> print-ln  ~ 09:05:07.042
```

Errors: the pattern is not a string.

## to-string

`time -> to-string`

The printed form.

```
9 -> time 5 7 -> to-string -> print-ln   ~ 09:05:07
```
