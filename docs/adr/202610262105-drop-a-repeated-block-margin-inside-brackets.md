# Drop a repeated block margin inside brackets

## Status

Proposed

## Context

[Let brackets span lines without margins](./202610231542-let-brackets-span-lines-without-margins.md) joins the lines of an open `(`, `[` or `{` before margins are read, so a leading bar inside brackets is an ordinary `|` token. At the top level that is fine. Inside a procedure body it is not: every line of the body starts with `|`, so a hashmap literal laid out over several lines there must break that pattern:

```
proc new-user name
| {"name": name
   "role": "member"}
```

Writing `|  "role": "member"}` instead, which is what the shape of the block suggests, gives `unexpected |; a lambda used as a value must be wrapped in parentheses`, an error that points away from the cause. Programs split into layers build many records as hashmap literals inside procedures, so this comes up often.

A bar inside brackets can also be a lambda's bar, as in `[1 2] -> array/map (n` followed by `| n * 2)` on the next line, so bars inside brackets cannot simply all be dropped.

## Decision

When a line break falls inside brackets, the lexer looks at the bars that start the next line. If there are exactly as many as the margin depth of the line the statement started on, and that depth is not zero, they are dropped, together with the blanks between them. Any other number of bars stays in the line as tokens, as before.

```
proc new-user name
| {"name": name
|  "role": "member"}
```

[Let brackets span lines without margins](./202610231542-let-brackets-span-lines-without-margins.md) stays in force for everything else: line breaks inside brackets are whitespace, and margins are not read there.

Rejected:

- **Drop any leading bars inside brackets.** It would break lambdas whose bar starts a continuation line, and silently: the lambda's parameters would run into its body.
- **Only improve the error message.** It would explain the rule, but the rule would still force literals in blocks to break the block's shape.
- **Require the repeated bars.** Literals written without them, as before this decision, would stop parsing.

## Consequences

- Multi-line literals inside blocks can keep the block's bars, and the old layout without them still works.
- Inside a block, a lambda in brackets whose bar starts a continuation line, with nothing but the block's bars before it, used to parse and now fails, because that bar is taken for the block's. Keeping the lambda's bar on the line of its parameters, `(n |` then `| n * 2)`, avoids it.
- The lexer looks ahead past blanks and bars at each line break inside brackets, once per line.
