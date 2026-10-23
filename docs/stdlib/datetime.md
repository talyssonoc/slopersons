# Datetime

A `datetime` is a calendar date with a time of day, at millisecond precision, in UTC. Values carry no time zone and are never converted; `now` is the current UTC moment. Datetimes are immutable. Build one from a date and a time with `at-time`, from text with `to-datetime`, or from the clock with `now`. They print as `yyyy-mm-ddTHH:MM:SS`, with `.SSS` appended only when the milliseconds are not zero. Comparison operators work between two datetimes; a datetime and a date do not compare.

## now

`now -> do`

The current moment in UTC.

```
now -> do -> type-of -> print-ln   ~ datetime
```

## at-time

`date -> at-time time`

Combines a date and a time.

```
2024 -> date 12 25 -> at-time (18 -> time 30 0) -> print-ln   ~ 2024-12-25T18:30:00
```

Errors: the time is not a time.

## to-datetime

`text -> to-datetime` or `milliseconds -> to-datetime`

From text, parses `yyyy-mm-ddTHH:MM`, `yyyy-mm-ddTHH:MM:SS` or `yyyy-mm-ddTHH:MM:SS.fff`, with a space allowed instead of `T` and an optional trailing `Z`. Offsets such as `+02:00` are not accepted. From an int, interprets it as milliseconds since 1970-01-01T00:00:00.

```
"2026-10-23 15:16" -> to-datetime -> print-ln   ~ 2026-10-23T15:16:00
0 -> to-datetime -> print-ln                    ~ 1970-01-01T00:00:00
```

Errors: text in another form, reported as `cannot convert "2026-10-23" to a datetime`; an int beyond a thousand million million.

## date, time

`datetime -> date`, `datetime -> time`

The two halves.

```
"2024-12-25T18:30:00" -> to-datetime => dinner
dinner -> date -> print-ln   ~ 2024-12-25
dinner -> time -> print-ln   ~ 18:30:00
```

## start-of-day

`datetime -> start-of-day`

The same date at midnight.

```
dinner -> start-of-day -> print-ln   ~ 2024-12-25T00:00:00
```

## epoch-milliseconds

`datetime -> epoch-milliseconds`

Milliseconds since 1970-01-01T00:00:00 as an int. Useful for timing: take `now -> do -> epoch-milliseconds` twice and subtract.

## year, month, day, weekday, weekday-number, hour, minute, second, millisecond

`datetime -> year` and so on

The components, as the date and time pages describe them.

```
dinner -> weekday -> print-ln   ~ wednesday
dinner -> hour -> print-ln      ~ 18
```

## add-days, add-hours, add-minutes, add-seconds, add-milliseconds

`datetime -> add-hours count` and likewise for the other units

Shifts by a whole number of units, which may be negative, carrying across days, months and years.

```
dinner -> add-hours 6 -> print-ln   ~ 2024-12-26T00:30:00
dinner -> add-days 7 -> print-ln    ~ 2025-01-01T18:30:00
```

Errors: the count is not an int; the result is beyond a thousand million million milliseconds from the epoch.

## days-between, seconds-between, milliseconds-between

`start -> days-between end` and likewise for the other units

The difference `end` minus `start` in whole units, floored, negative when `end` is earlier.

```
"2024-12-27T06:00:00" -> to-datetime => departure
dinner -> days-between departure -> print-ln      ~ 1
dinner -> seconds-between departure -> print-ln   ~ 127800
```

Errors: the end is not a datetime.

## format

`datetime -> format pattern`

Renders with the date tokens from the [date page](date.md) and the time tokens from the [time page](time.md) in one pattern. Lowercase `mm` is the month and uppercase `MM` the minute.

```
dinner -> format "dddd, mmmm d yyyy at H:MM" -> print-ln   ~ Wednesday, December 25 2024 at 18:30
```

## to-string

`datetime -> to-string`

The printed form.

```
dinner -> to-string -> print-ln   ~ 2024-12-25T18:30:00
```
