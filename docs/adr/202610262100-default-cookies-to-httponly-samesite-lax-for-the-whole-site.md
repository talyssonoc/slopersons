# Default cookies to HttpOnly, SameSite=Lax, for the whole site

## Status

Proposed

## Context

Web apps on the [http module](./202610241758-serve-http-from-a-slopersons-module-over-sockets.md) that let people log in keep a session token in a cookie. Before this, a program had to parse the `Cookie` header itself and write `Set-Cookie` lines by hand. Getting the attributes of such a line wrong leaves the session open to attack:

- Without `HttpOnly`, any script that runs in the page, including one injected through a bug, can read the token. [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- Without `SameSite=Lax` or `Strict`, a page on another site can submit a form to the app, and the browser sends the session cookie with it (cross-site request forgery). `Lax` withholds the cookie from requests other sites start, except top-level navigations that use a safe method such as GET.
- Without `Path=/`, a cookie set by a response to `/login` is sent only to paths under `/login`.
- `SameSite=None` without `Secure` is refused by current browsers.

A cookie value cannot hold spaces, double quotes, commas, semicolons or backslashes ([RFC 6265, section 4.1.1](https://www.rfc-editor.org/rfc/rfc6265#section-4.1.1)). A value that contains a semicolon would also add attributes of its own.

## Decision

- **`request -> http/cookies`** returns the cookies of the `Cookie` header as a hashmap. When a name repeats, the first value wins, because browsers list the cookie with the most specific path first. Values are not percent-decoded, as RFC 6265 does not encode them.
- **`response -> http/set-cookie name value options`** adds one `Set-Cookie` line and returns the response. Its defaults are `Path=/`, `HttpOnly` and `SameSite=Lax`; `options` can change them and add `Domain`, `Max-Age` and `Secure`. Unknown options, values a cookie cannot hold and `SameSite=None` without `Secure` are errors.
- Both are written in slopersons in `src/stdlib/http.slop`.

Rejected:

- **No defaults, so the line says exactly what the options say.** It is more predictable, but a program that passes `{}` would get a cookie readable by scripts and sent with other sites' requests, which is the wrong result for the one cookie most apps set.
- **`Secure` by default.** `http/serve` speaks plain HTTP, so a secure cookie would never come back and logging in would silently fail. A program behind an HTTPS proxy sets `"secure": yes`.
- **Percent-encoding values automatically.** A cookie set by another program would then be read back differently from how it was written. Programs that need to store other characters encode them before calling.
- **An `Expires` option.** `Max-Age` covers the same need with an int, and needs no date formatting.
- **A third, optional argument instead of a required options hashmap.** Source modules have exact arity, so the options are always passed; `{}` is short.

## Consequences

- A session cookie needs one call with `{}`, and is protected against script access and cross-site form posts by default.
- `SameSite=Lax` is the CSRF protection the module provides. An app that changes data on GET requests, or must support browsers without SameSite, needs its own CSRF tokens.
- Clearing a cookie is `http/set-cookie name "" {"max-age": 0}`, with the same path it was set with.
