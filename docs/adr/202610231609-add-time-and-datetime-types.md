# Add time and datetime types

## Status

Accepted

## Context

The first version modelled dates as calendar dates without time of day, leaving time for a later decision. Programs that record when something happened, or measure how long it took, need a time of day as well. Three questions shaped it: whether to extend `date` or add types, which clock and zone to use, and what precision to keep. A constraint carried over from the no-proxy rule is that the only JavaScript time call allowed is `Date.now()`, which rules out zone conversions through `Date` or `Intl`.

## Decision

Two new types, with `date` unchanged:

- `time` is a time of day stored as milliseconds since midnight. Built with `hour -> time minute second [millisecond]` or `"HH:MM:SS" -> to-time`. Shifting a time wraps around midnight, since it has no date.
- `datetime` is a date with a time, stored as milliseconds since 1970-01-01T00:00:00 UTC. Built with `date -> at-time time`, `"yyyy-mm-ddTHH:MM:SS" -> to-datetime`, an epoch int, or `now -> do`. Values carry no zone and are never converted; `now` is UTC like `today`.
- Precision is milliseconds. ISO text without a fraction still parses, and the printed form shows `.SSS` only when the milliseconds are not zero.
- Format tokens for time are uppercase (`HH`, `H`, `MM`, `M`, `SS`, `S`, `SSS`) so a datetime pattern can mix them with the lowercase date tokens; `mm` is the month and `MM` the minute.
- A datetime and a date do not compare or equal each other; extract `-> date` first.

Rejected:

- Extending `date` with an optional time: fewer names, but equality and arithmetic between a plain date and a dated time get murky, and every date builtin would need a rule for the time part.
- Local time for `now`: it would need `getTimezoneOffset()` from JavaScript and would be a snapshot that ignores daylight-saving changes during a run.
- Whole seconds: simpler output, but `now` could not measure anything shorter than a second.

## Consequences

- A printed `now` is UTC, not the machine's wall clock; the documentation says so.
- The month-versus-minute token case is a thing to learn; the time and datetime pages state it next to the token tables.
- The decision on calendar dates stands: `date` still has no time of day, and `datetime` sits beside it.
- Time zones and durations as values remain open.
