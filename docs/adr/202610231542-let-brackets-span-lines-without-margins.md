# Let brackets span lines without margins

## Status

Accepted

## Context

Long array and hashmap literals need line breaks.

## Decision

Inside an open `(`, `[` or `{`, line breaks are plain whitespace and leading bars are not margins. The lexer joins the physical lines before margin detection.

## Consequences

- A literal may be laid out over several lines.
- A lambda bar inside a multi-line literal is an ordinary token, never a margin.
