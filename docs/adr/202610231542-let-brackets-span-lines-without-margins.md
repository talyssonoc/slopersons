# Let brackets span lines without margins

## Status

Superseded by [Drop a repeated block margin inside brackets](./202610262105-drop-a-repeated-block-margin-inside-brackets.md)

## Context

Long array and hashmap literals need line breaks.

## Decision

Inside an open `(`, `[` or `{`, line breaks are plain whitespace and leading bars are not margins. The lexer joins the physical lines before margin detection.

## Consequences

- A literal may be laid out over several lines.
- A lambda bar inside a multi-line literal is an ordinary token, never a margin.
