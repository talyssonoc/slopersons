# Datetime

A `datetime` is a calendar date with a time of day, at millisecond precision, in UTC. Values carry no time zone and are never converted; `datetime/now` is the current UTC moment. Datetimes are immutable. Build one from a date and a time with `date/at-time`, from text with `datetime/parse`, from epoch milliseconds with `datetime/from-epoch`, or from the clock with `datetime/now`. They print as `yyyy-mm-ddTHH:MM:SS`, with `.SSS` appended only when the milliseconds are not zero. Comparison operators work between two datetimes; a datetime and a date do not compare.

The datetime functions live in the `datetime` module and are called by their qualified names: `datetime/now`, `datetime/parse`, `datetime/year` and so on. `date/at-time` is the one exception: it is the way to build a datetime from parts, and it lives in the `date` module because its input is a date, so it is documented on the [date page](date.md). Every function below except `datetime/now`, `datetime/parse` and `datetime/from-epoch` takes a datetime as its input and reports `` the input of `datetime/year` must be a datetime, got a date `` when given anything else.

```
2024 -> date/make 12 25 -> date/at-time (18 -> time/make 30 0) -> io/print-ln   ~ 2024-12-25T18:30:00
```

## datetime/now

`datetime/now -> do`

The current moment in UTC. `datetime/now` takes no input, so it is called through `do`.

```
datetime/now -> do -> type-of -> io/print-ln   ~ datetime
```

## datetime/parse

`text -> datetime/parse`

Parses `yyyy-mm-ddTHH:MM`, `yyyy-mm-ddTHH:MM:SS` or `yyyy-mm-ddTHH:MM:SS.fff`, with a space allowed instead of `T` and an optional trailing `Z`. Offsets such as `+02:00` are not accepted.

```
"2026-10-23 15:16" -> datetime/parse -> io/print-ln      ~ 2026-10-23T15:16:00
"2026-10-23T15:16:00.5Z" -> datetime/parse -> io/print-ln ~ 2026-10-23T15:16:00.500
```

Errors: the input is not a string; text in another form, reported as `cannot convert "2026-10-23" to a datetime`.

## datetime/from-epoch

`milliseconds -> datetime/from-epoch`

Interprets an int as milliseconds since 1970-01-01T00:00:00.

```
0 -> datetime/from-epoch -> io/print-ln    ~ 1970-01-01T00:00:00
-1 -> datetime/from-epoch -> io/print-ln   ~ 1969-12-31T23:59:59.999
```

Errors: the input is not an int; an int beyond a thousand million million, reported as `epoch milliseconds N is out of range`.

## datetime/date, datetime/time

`datetime -> datetime/date`, `datetime -> datetime/time`

The two halves. `date/at-time` puts them back together.

```
"2024-12-25T18:30:00" -> datetime/parse => dinner
dinner -> datetime/date -> io/print-ln   ~ 2024-12-25
dinner -> datetime/time -> io/print-ln   ~ 18:30:00
```

## datetime/start-of-day

`datetime -> datetime/start-of-day`

The same date at midnight.

```
dinner -> datetime/start-of-day -> io/print-ln   ~ 2024-12-25T00:00:00
```

## datetime/epoch-milliseconds

`datetime -> datetime/epoch-milliseconds`

Milliseconds since 1970-01-01T00:00:00 as an int. Useful for timing: take `datetime/now -> do -> datetime/epoch-milliseconds` twice and subtract.

```
dinner -> datetime/epoch-milliseconds -> io/print-ln   ~ 1735151400000
```

## datetime/year, datetime/month, datetime/day, datetime/weekday, datetime/weekday-number, datetime/hour, datetime/minute, datetime/second, datetime/millisecond

`datetime -> datetime/year` and so on

The components, as the date and time pages describe them.

```
dinner -> datetime/weekday -> io/print-ln   ~ wednesday
dinner -> datetime/hour -> io/print-ln      ~ 18
```

## datetime/add-days, datetime/add-hours, datetime/add-minutes, datetime/add-seconds, datetime/add-milliseconds

`datetime -> datetime/add-hours count` and likewise for the other units

Shifts by a whole number of units, which may be negative, carrying across days, months and years.

```
dinner -> datetime/add-hours 6 -> io/print-ln   ~ 2024-12-26T00:30:00
dinner -> datetime/add-days 7 -> io/print-ln    ~ 2025-01-01T18:30:00
```

Errors: the count is not an int; the result is beyond a thousand million million milliseconds from the epoch.

## datetime/days-between, datetime/seconds-between, datetime/milliseconds-between

`start -> datetime/days-between end` and likewise for the other units

The difference `end` minus `start` in whole units, floored, negative when `end` is earlier.

```
"2024-12-27T06:00:00" -> datetime/parse => departure
dinner -> datetime/days-between departure -> io/print-ln      ~ 1
dinner -> datetime/seconds-between departure -> io/print-ln   ~ 127800
```

Errors: the end is not a datetime.

## datetime/format

`datetime -> datetime/format pattern`

Renders with the date tokens from the [date page](date.md) and the time tokens from the [time page](time.md) in one pattern. Lowercase `mm` is the month and uppercase `MM` the minute.

```
dinner -> datetime/format "dddd, mmmm d yyyy at H:MM" -> io/print-ln   ~ Wednesday, December 25 2024 at 18:30
```

Errors: the pattern is not a string.

## datetime/to-string

`datetime -> datetime/to-string`

The printed form.

```
dinner -> datetime/to-string -> io/print-ln   ~ 2024-12-25T18:30:00
```
