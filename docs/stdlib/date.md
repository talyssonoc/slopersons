# Date builtins

A date is an immutable calendar date with no time of day: a year, a month and a day in the proleptic Gregorian calendar, stored as the number of days since 1970-01-01. Every operation returns a new date; nothing modifies one in place.

Dates are built from an int year flowing into `date`, parsed from a `yyyy-mm-dd` string with `to-date`, or taken from the clock with `today`, which uses the current day in UTC. A date prints as `yyyy-mm-dd`, equals another date when they are the same day, and orders with `<`, `<=`, `>` and `>=` like any other comparable value.

```
2026 -> date 10 23 => release
"2026-12-25" -> to-date => holiday
release -> print-ln                           ~ 2026-10-23
release < holiday -> print-ln                 ~ yes
release -> days-between holiday -> print-ln   ~ 63
today -> do -> format "dddd, d mmmm yyyy" -> print-ln
```

Builtins marked "shared" exist for other types too; their other forms are on the pages of those types.

## today

`today -> do`

Returns the current calendar date in UTC. `today` takes no input, so it is called through `do`.

```
today -> do -> type-of -> print-ln    ~ date
```

## date

`year -> date month day`

Builds the date with the given components. All three are ints; the month runs from 1 to 12 and the day from 1 to the length of that month.

```
2026 -> date 10 23 -> print-ln    ~ 2026-10-23
2024 -> date 2 29 -> print-ln     ~ 2024-02-29
```

Errors: the input is not an int; the month or day is not an int; a component is out of range; the components do not form a real date (`2026-02-30 is not a valid date`).

## to-date (shared)

`string -> to-date`

Parses a string written as `yyyy-mm-dd`, with four digits for the year and two for the month and the day.

```
"2026-10-23" -> to-date -> print-ln          ~ 2026-10-23
"2026-10-23" -> to-date -> month -> print-ln  ~ 10
```

Errors: the string is not in that form or does not name a real date (`cannot convert "2026/10/23" to a date`).

## year

`date -> year`

Returns the year as an int.

```
2026 -> date 10 23 -> year -> print-ln    ~ 2026
```

## month

`date -> month`

Returns the month as an int from 1 to 12.

```
2026 -> date 10 23 -> month -> print-ln    ~ 10
```

## day

`date -> day`

Returns the day of the month as an int.

```
2026 -> date 10 23 -> day -> print-ln    ~ 23
```

## weekday

`date -> weekday`

Returns the lowercase English name of the day of the week.

```
1970 -> date 1 1 -> weekday -> print-ln    ~ thursday
2000 -> date 1 1 -> weekday -> print-ln    ~ saturday
```

## weekday-number

`date -> weekday-number`

Returns the day of the week as an int: 1 for Monday through 7 for Sunday.

```
1970 -> date 1 1 -> weekday-number -> print-ln    ~ 4
```

## month-name

`date -> month-name`

Returns the lowercase English name of the month.

```
2026 -> date 10 23 -> month-name -> print-ln    ~ october
```

## day-of-year

`date -> day-of-year`

Returns the position of the day within its year, from 1 for January 1 to 365 or 366 for December 31.

```
2026 -> date 10 23 -> day-of-year -> print-ln    ~ 296
2024 -> date 12 31 -> day-of-year -> print-ln    ~ 366
```

## is-leap-year (shared)

`date -> is-leap-year` or `year -> is-leap-year`

Returns `yes` when the year of the date, or the int year itself, has 366 days: divisible by 4, except centuries not divisible by 400.

```
2024 -> is-leap-year -> print-ln                ~ yes
1900 -> is-leap-year -> print-ln                ~ no
2024 -> date 6 1 -> is-leap-year -> print-ln    ~ yes
```

Errors: an int year is out of range.

## add-days

`date -> add-days count`

Returns the date `count` days later. A negative count moves backwards.

```
2026 -> date 10 23 -> add-days 10 -> print-ln     ~ 2026-11-02
2026 -> date 10 23 -> add-days -23 -> print-ln    ~ 2026-09-30
```

Errors: the count is not an int; the count is out of range.

## add-months

`date -> add-months count`

Returns the date `count` months later, keeping the day of the month when the target month has it and otherwise clamping to that month's last day. A negative count moves backwards.

```
2024 -> date 1 31 -> add-months 1 -> print-ln     ~ 2024-02-29
2023 -> date 1 31 -> add-months 1 -> print-ln     ~ 2023-02-28
2026 -> date 1 15 -> add-months -3 -> print-ln    ~ 2025-10-15
```

Errors: the count is not an int; the count is out of range.

## add-years

`date -> add-years count`

Returns the date `count` years later. February 29 becomes February 28 when the target year is not a leap year. A negative count moves backwards.

```
2024 -> date 2 29 -> add-years 1 -> print-ln    ~ 2025-02-28
2024 -> date 2 29 -> add-years 4 -> print-ln    ~ 2028-02-29
```

Errors: the count is not an int; the count is out of range.

## days-between

`start -> days-between end`

Returns the number of days from `start` to `end` as an int: positive when `end` is later, negative when it is earlier, 0 for the same day.

```
(2026 -> date 1 1) -> days-between (2026 -> date 12 31) -> print-ln    ~ 364
(2026 -> date 12 31) -> days-between (2026 -> date 1 1) -> print-ln    ~ -364
```

Errors: the end is not a date.

## days-in-month

`date -> days-in-month`

Returns how many days the month of the date has.

```
2024 -> date 2 10 -> days-in-month -> print-ln    ~ 29
2026 -> date 4 10 -> days-in-month -> print-ln    ~ 30
```

## start-of-month

`date -> start-of-month`

Returns the first day of the month of the date.

```
2026 -> date 10 23 -> start-of-month -> print-ln    ~ 2026-10-01
```

## end-of-month

`date -> end-of-month`

Returns the last day of the month of the date.

```
2026 -> date 10 23 -> end-of-month -> print-ln    ~ 2026-10-31
2024 -> date 2 10 -> end-of-month -> print-ln     ~ 2024-02-29
```

## format

`date -> format pattern`

Renders the date as a string. The tokens below are replaced wherever they appear in `pattern`; longer tokens win over shorter ones at the same position, and every other character is copied through. Names produced by `format` are capitalized, unlike `weekday` and `month-name`.

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
2026 -> date 10 5 -> format "yyyy-mm-dd" -> print-ln          ~ 2026-10-05
2026 -> date 10 5 -> format "d/m/yy" -> print-ln              ~ 5/10/26
2026 -> date 10 5 -> format "dddd, mmmm d" -> print-ln        ~ Monday, October 5
2026 -> date 10 5 -> format "ddd dd mmm yyyy" -> print-ln     ~ Mon 05 Oct 2026
```

Errors: the pattern is not a string.

## to-string (shared)

`date -> to-string`

Returns the date as a `yyyy-mm-dd` string, the same form `print-ln` uses.

```
2026 -> date 10 23 -> to-string -> print-ln    ~ 2026-10-23
```

## at-time

`date -> at-time time`

Combines the date with a time of day into a datetime. Documented on the [datetime page](datetime.md).
