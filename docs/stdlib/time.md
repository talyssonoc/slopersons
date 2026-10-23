# Time

A `time` is a time of day with millisecond precision: hours, minutes, seconds and milliseconds since midnight. Times are immutable and carry no date and no time zone. There is no literal; build one with `time/make` or `time/parse`, or take one from a datetime with `datetime/time`. Times print as `HH:MM:SS`, with `.SSS` appended only when the milliseconds are not zero. `<`, `=` and the other comparison operators work between two times.

The time functions live in the `time` module and are called by their qualified names: `time/make`, `time/parse`, `time/hour` and so on. Every function below except `time/make` and `time/parse` takes a time as its input and reports `` the input of `time/hour` must be a time, got a string `` when given anything else.

## time/make

`hour -> time/make minute second` or `hour -> time/make minute second millisecond`

Builds a time from its components.

```
12 -> time/make 30 0 -> io/print-line      ~ 12:30:00
9 -> time/make 5 7 42 -> io/print-line     ~ 09:05:07.042
```

Errors: a component is not an int; the components do not form a valid time, reported as `25:00:00 is not a valid time`.

## time/parse

`text -> time/parse`

Parses `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff` with one to three fraction digits.

```
"12:30" -> time/parse -> io/print-line      ~ 12:30:00
"12:30:15.5" -> time/parse -> io/print-line ~ 12:30:15.500
```

Errors: the input is not a string; the text is not in one of those forms, reported as `cannot convert "12h30" to a time`.

## time/hour, time/minute, time/second, time/millisecond

`time -> time/hour`, `time -> time/minute`, `time -> time/second`, `time -> time/millisecond`

Each component as an int.

```
9 -> time/make 5 7 42 -> time/minute -> io/print-line   ~ 5
```

## time/to-milliseconds

`time -> time/to-milliseconds`

Milliseconds since midnight as an int.

```
0 -> time/make 0 1 500 -> time/to-milliseconds -> io/print-line   ~ 1500
```

## time/add-hours, time/add-minutes, time/add-seconds, time/add-milliseconds

`time -> time/add-hours count` and likewise for the other units

Shifts the time by a whole number of units, which may be negative. A time has no date, so the result wraps around midnight.

```
23 -> time/make 30 0 -> time/add-hours 2 -> io/print-line     ~ 01:30:00
0 -> time/make 10 0 -> time/add-minutes -20 -> io/print-line  ~ 23:50:00
```

Errors: the count is not an int; the count is beyond a thousand million million, reported as `hour count N is out of range`.

## time/milliseconds-between, time/seconds-between

`start -> time/milliseconds-between end`, `start -> time/seconds-between end`

The difference `end` minus `start` within one day, negative when `end` is earlier. Seconds are floored.

```
(9 -> time/make 0 0) -> time/seconds-between (10 -> time/make 30 0) -> io/print-line   ~ 5400
```

Errors: the end is not a time.

## time/format

`time -> time/format pattern`

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
9 -> time/make 5 7 42 -> time/format "H:MM" -> io/print-line          ~ 9:05
9 -> time/make 5 7 42 -> time/format "HH:MM:SS.SSS" -> io/print-line  ~ 09:05:07.042
```

Errors: the pattern is not a string.

## time/to-string

`time -> time/to-string`

The printed form.

```
9 -> time/make 5 7 -> time/to-string -> io/print-line   ~ 09:05:07
```
