# Delimit blocks with margin bars

## Status

Accepted

## Context

Blocks needed a form with no closing tokens and no whitespace sensitivity that does not read as braces or as Python-style indentation.

## Decision

A line that starts with `|` belongs to the header line above it, and nesting adds another bar (`| |`). Blank lines inside a block are ignored.

Rejected:

- Significant indentation: whitespace errors, and it reads as the Python family.
- Paired delimiters such as `( )`: explicit and editor friendly, but it reads as braces with different glyphs.

## Consequences

- Nesting depth is visible on every line of a block.
- The lambda bar and the margin bar share a glyph, so a line cannot start with a lambda bar; zero-parameter lambdas need parentheses or a call context.
- Deeply nested code repeats bars on every line.
