# Date builtins

A date is an immutable calendar date with no time of day: a year, a month and a day in the proleptic Gregorian calendar, stored as the number of days since 1970-01-01. Every operation returns a new date; nothing modifies one in place.

The date functions live in the `date` module and are called by their qualified names: `date/make`, `date/parse`, `date/year` and so on. Dates are built from an int year flowing into `date/make`, parsed from a `yyyy-mm-dd` string with `date/parse`, or taken from the clock with `date/today`, which uses the current day in UTC. A date prints as `yyyy-mm-dd`, equals another date when they are the same day, and orders with `<`, `<=`, `>` and `>=` like any other comparable value.

```
2026 -> date/make 10 23 => release
"2026-12-25" -> date/parse => holiday
release -> io/print-line                               ~ 2026-10-23
release < holiday -> io/print-line                     ~ yes
release -> date/days-between holiday -> io/print-line  ~ 63
date/today -> do -> date/format "dddd, d mmmm yyyy" -> io/print-line
```

Every function below except `date/today`, `date/make`, `date/parse` and `date/is-leap-year` takes a date as its input and reports `` the input of `date/year` must be a date, got a string `` when given anything else.

## date/today

`date/today -> do`

Returns the current calendar date in UTC. `date/today` takes no input, so it is called through `do`.

```
date/today -> do -> type-of -> io/print-line    ~ date
```

## date/make

`year -> date/make month day`

Builds the date with the given components. All three are ints; the month runs from 1 to 12 and the day from 1 to the length of that month.

```
2026 -> date/make 10 23 -> io/print-line  ~ 2026-10-23
2024 -> date/make 2 29 -> io/print-line   ~ 2024-02-29
```

Errors: the input is not an int; the month or day is not an int; a component is out of range; the components do not form a real date (`2026-02-30 is not a valid date`).

## date/parse

`string -> date/parse`

Parses a string written as `yyyy-mm-dd`, with four digits for the year and two for the month and the day.

```
"2026-10-23" -> date/parse -> io/print-line                ~ 2026-10-23
"2026-10-23" -> date/parse -> date/month -> io/print-line  ~ 10
```

Errors: the input is not a string; the string is not in that form or does not name a real date (`cannot convert "2026/10/23" to a date`).

## date/year

`date -> date/year`

Returns the year as an int.

```
2026 -> date/make 10 23 -> date/year -> io/print-line    ~ 2026
```

## date/month

`date -> date/month`

Returns the month as an int from 1 to 12.

```
2026 -> date/make 10 23 -> date/month -> io/print-line    ~ 10
```

## date/day

`date -> date/day`

Returns the day of the month as an int.

```
2026 -> date/make 10 23 -> date/day -> io/print-line    ~ 23
```

## date/weekday

`date -> date/weekday`

Returns the lowercase English name of the day of the week.

```
1970 -> date/make 1 1 -> date/weekday -> io/print-line  ~ thursday
2000 -> date/make 1 1 -> date/weekday -> io/print-line  ~ saturday
```

## date/weekday-number

`date -> date/weekday-number`

Returns the day of the week as an int: 1 for Monday through 7 for Sunday.

```
1970 -> date/make 1 1 -> date/weekday-number -> io/print-line    ~ 4
```

## date/month-name

`date -> date/month-name`

Returns the lowercase English name of the month.

```
2026 -> date/make 10 23 -> date/month-name -> io/print-line    ~ october
```

## date/day-of-year

`date -> date/day-of-year`

Returns the position of the day within its year, from 1 for January 1 to 365 or 366 for December 31.

```
2026 -> date/make 10 23 -> date/day-of-year -> io/print-line  ~ 296
2024 -> date/make 12 31 -> date/day-of-year -> io/print-line  ~ 366
```

## date/is-leap-year

`date -> date/is-leap-year` or `year -> date/is-leap-year`

Returns `yes` when the year of the date, or the int year itself, has 366 days: divisible by 4, except centuries not divisible by 400. This is the one date function that accepts two input types.

```
2024 -> date/is-leap-year -> io/print-line                   ~ yes
1900 -> date/is-leap-year -> io/print-line                   ~ no
2024 -> date/make 6 1 -> date/is-leap-year -> io/print-line  ~ yes
```

Errors: an int year is out of range; the input is neither a date nor an int (`` `date/is-leap-year` cannot be used with a string; it works on date, int ``).

## date/add-days

`date -> date/add-days count`

Returns the date `count` days later. A negative count moves backwards.

```
2026 -> date/make 10 23 -> date/add-days 10 -> io/print-line   ~ 2026-11-02
2026 -> date/make 10 23 -> date/add-days -23 -> io/print-line  ~ 2026-09-30
```

Errors: the count is not an int; the count is out of range.

## date/add-months

`date -> date/add-months count`

Returns the date `count` months later, keeping the day of the month when the target month has it and otherwise clamping to that month's last day. A negative count moves backwards.

```
2024 -> date/make 1 31 -> date/add-months 1 -> io/print-line   ~ 2024-02-29
2023 -> date/make 1 31 -> date/add-months 1 -> io/print-line   ~ 2023-02-28
2026 -> date/make 1 15 -> date/add-months -3 -> io/print-line  ~ 2025-10-15
```

Errors: the count is not an int; the count is out of range.

## date/add-years

`date -> date/add-years count`

Returns the date `count` years later. February 29 becomes February 28 when the target year is not a leap year. A negative count moves backwards.

```
2024 -> date/make 2 29 -> date/add-years 1 -> io/print-line  ~ 2025-02-28
2024 -> date/make 2 29 -> date/add-years 4 -> io/print-line  ~ 2028-02-29
```

Errors: the count is not an int; the count is out of range.

## date/days-between

`start -> date/days-between end`

Returns the number of days from `start` to `end` as an int: positive when `end` is later, negative when it is earlier, 0 for the same day.

```
(2026 -> date/make 1 1) -> date/days-between (2026 -> date/make 12 31) -> io/print-line  ~ 364
(2026 -> date/make 12 31) -> date/days-between (2026 -> date/make 1 1) -> io/print-line  ~ -364
```

Errors: the end is not a date.

## date/days-in-month

`date -> date/days-in-month`

Returns how many days the month of the date has.

```
2024 -> date/make 2 10 -> date/days-in-month -> io/print-line  ~ 29
2026 -> date/make 4 10 -> date/days-in-month -> io/print-line  ~ 30
```

## date/start-of-month

`date -> date/start-of-month`

Returns the first day of the month of the date.

```
2026 -> date/make 10 23 -> date/start-of-month -> io/print-line    ~ 2026-10-01
```

## date/end-of-month

`date -> date/end-of-month`

Returns the last day of the month of the date.

```
2026 -> date/make 10 23 -> date/end-of-month -> io/print-line  ~ 2026-10-31
2024 -> date/make 2 10 -> date/end-of-month -> io/print-line   ~ 2024-02-29
```

## date/format

`date -> date/format pattern`

Renders the date as a string. The tokens below are replaced wherever they appear in `pattern`; longer tokens win over shorter ones at the same position, and every other character is copied through. Names produced by `date/format` are capitalized, unlike `date/weekday` and `date/month-name`.

| Token  | Meaning                           | 2026-10-05 |
| ------ | --------------------------------- | ---------- |
| `yyyy` | year, at least four digits        | `2026`     |
| `yy`   | last two digits of the year       | `26`       |
| `mmmm` | full month name                   | `October`  |
| `mmm`  | three-letter month name           | `Oct`      |
| `mm`   | month, two digits                 | `10`       |
| `m`    | month                             | `10`       |
| `dddd` | full weekday name                 | `Monday`   |
| `ddd`  | three-letter weekday name         | `Mon`      |
| `dd`   | day of the month, two digits      | `05`       |
| `d`    | day of the month                  | `5`        |

Because `d`, `m` and `y` are tokens, literal text containing those letters is rewritten too: write such text outside the pattern and join with `+`.

```
2026 -> date/make 10 5 -> date/format "yyyy-mm-dd" -> io/print-line        ~ 2026-10-05
2026 -> date/make 10 5 -> date/format "d/m/yy" -> io/print-line            ~ 5/10/26
2026 -> date/make 10 5 -> date/format "dddd, mmmm d" -> io/print-line      ~ Monday, October 5
2026 -> date/make 10 5 -> date/format "ddd dd mmm yyyy" -> io/print-line   ~ Mon 05 Oct 2026
```

Errors: the pattern is not a string.

## date/to-string

`date -> date/to-string`

Returns the date as a `yyyy-mm-dd` string, the same form `io/print-line` uses.

```
2026 -> date/make 10 23 -> date/to-string -> io/print-line    ~ 2026-10-23
```

## date/at-time

`date -> date/at-time time`

Combines the date with a time of day into a datetime at that moment in UTC. It lives in the `date` module because its input is a date; it is the way to build a datetime from parts. The result is described on the [datetime page](datetime.md).

```
2024 -> date/make 12 25 -> date/at-time (18 -> time/make 30 0) -> io/print-line      ~ 2024-12-25T18:30:00
2024 -> date/make 12 25 -> date/at-time (18 -> time/make 30 0 250) -> io/print-line  ~ 2024-12-25T18:30:00.250
```

Errors: the time is not a time (`` the time of `date/at-time` must be a time, got an int ``); the result is beyond a thousand million million milliseconds from the epoch.
