# HTTP builtins

The `http` module serves HTTP/1.1 over a [socket](socket.md) listener. A handler is an ordinary procedure: it takes a request hashmap and returns a response hashmap. Because handlers are plain procedures, the [test](test.md) module can test them with hashmap literals and no network. The module is written in slopersons, in `src/stdlib/http.slop`.

```
proc handle request
| request -> hashmap/at "path" => route
| route = "/" ? "Hello!" -> http/text -> out
| route = "/time" ? {"now": "{datetime/now -> do}"} -> http/json -> out
| "nothing at {route}" -> http/text -> hashmap/put "status" 404

"127.0.0.1" -> socket/listen 8080 => listener
listener -> http/serve handle
```

`docs/examples/notes/notes.slop` is a small app built this way: a page with a form, a JSON API and a query example. Run it with `./bin/slopersons.mjs docs/examples/notes/notes.slop` and open http://127.0.0.1:8080.

## Requests

A request is a hashmap:

```
{"method": "GET"  "target": "/search?q=caf%C3%A9&tag=a&tag=b"  "path": "/search"  "query": {"q": "café"  "tag": ["a" "b"]}  "headers": {"host": "localhost:8080"}  "body": ""}
```

- `target` is the request target exactly as sent.
- `path` is the part before `?`, percent-decoded. A `+` in the path stays a `+`.
- `query` is the part after `?`, decoded like a form (see `http/parse-form`). A name that appears once has a string value. A name that appears more than once has an array of its values in order. A name with no `=` has the value `""`.
- `headers` has every header name in lower case, since HTTP names are case-insensitive. The value has the spaces around it trimmed. A header sent more than once has its values joined with `", "`.
- `body` is the body as a string, read by its `Content-Length`. A request without one has `""`.

## Responses

A response is a hashmap with three entries, all optional:

- `status`: an int from 200 to 599; 200 when missing.
- `headers`: a hashmap from header names to strings. A value can also be an array of strings, which sends one header line per item, as `set-cookie` needs.
- `body`: a string; `""` when missing.

`http` adds `content-length`, counted in bytes, and `connection: close`, and ignores those headers, and `transfer-encoding`, when a handler sets them. A response with a body and no `content-type` gets `text/plain; charset=utf-8`. A 204 or 304 response is sent without a length or a body. A header value containing a line break is refused, so a value taken from a request cannot add headers of its own.

## serve

`listener -> http/serve handler`

Answers requests on the listener, one connection at a time, forever. Ctrl-C stops it (see [Ctrl-C](../cli.md#ctrl-c)). For each connection it reads one request, calls `handler` with it, writes the response and closes the connection. A `HEAD` request gets the response without its body.

- **The handler fails or returns something that is not a valid response:** the client gets `500 Internal Server Error`. Standard error gets the request and the error with its position:

  ```
  error in the handler for GET /fail: division by zero
    at app.slop:12:23
  ```

  The server goes on with the next connection.
- **A request `http` cannot accept** gets an answer naming the problem, and the handler is not called:
  - `400 Bad Request`: not valid HTTP;
  - `411 Length Required`: a body sent with `Transfer-Encoding`, which is not supported;
  - `413 Content Too Large`: a body of more than 1 MiB;
  - `431 Request Header Fields Too Large`: a head of more than 16 KiB or more than 100 header lines;
  - `505 HTTP Version Not Supported`: anything but HTTP/1.0 and HTTP/1.1.
- **A client that connects and sends nothing for a second is dropped.** Browsers sometimes open a connection ahead of time and never use it, and with one connection at a time it would hold up everyone else. Once the request line has arrived, the rest of the request and the response each have 10 seconds.
- **A client that leaves halfway is dropped** without affecting the server.

```
"127.0.0.1" -> socket/listen 8080 -> http/serve request | "you asked for {request -> hashmap/at "path"}" -> http/text
```

Errors: the input is not a listener; the handler is not a procedure.

## read-request

`connection -> http/read-request`

Reads one request from a stream and returns it as a request hashmap, or `nothing` when the stream ends before a request starts. `http/serve` uses it, and a program can use it to write its own accept loop. It also works on a file holding a raw request, which is how request parsing is tested without a network. It sets no timeouts: those belong to the loop that accepted the connection.

```
"request.txt" -> file/open "read" -> http/read-request -> hashmap/at "path" -> io/print-line
```

Errors: the input is not a stream; the request cannot be accepted. The message names the status a server would answer with and the problem: `cannot accept the request (400 Bad Request): the header line "NoColon" has no colon`.

## write-response

`connection -> http/write-response response`

Writes a response hashmap to a stream, with the status line, headers, length and body described under [Responses](#responses), and flushes it. It does not close the stream.

```
connection -> http/write-response {"status": 201  "body": "created"}
```

Errors: the input is not a stream; the response is not a hashmap; the status is not an int from 200 to 599; the headers are not a hashmap of valid names to strings or arrays of strings; a header value contains a line break; the body is not a string.

## text, html, json

`body -> http/text`, `body -> http/html`, `value -> http/json`

Build a 200 response. `text` uses `text/plain; charset=utf-8` and `html` uses `text/html; charset=utf-8`. `json` writes the value with `json/stringify` and uses `application/json`. Change the status with `hashmap/put "status" 404`.

```
"<h1>Hi</h1>" -> http/html
{"ok": yes} -> http/json
"not found" -> http/text -> hashmap/put "status" 404
```

Errors: the body of `text` or `html` is not a string; the value given to `json` has no JSON form.

## redirect

`location -> http/redirect`

Builds a `303 See Other` response to `location`. It is the usual answer to a form POST, so that reloading the page does not send the form again.

```
"/" -> http/redirect
```

## parse-form

`text -> http/parse-form`

Decodes `name=value&name=value` text, the format of query strings and of form bodies sent as `application/x-www-form-urlencoded`. It returns a hashmap in the same shape as a request's `query`:
- `+` becomes a space and `%XX` sequences are decoded as UTF-8;
- a name given more than once gets an array of its values;
- empty pieces are skipped.

```
"text=Buy+milk&tag=a&tag=b" -> http/parse-form -> io/print-line   ~ {"text": "Buy milk"  "tag": ["a" "b"]}
```

Errors: the input is not a string; a `%` is not followed by two hexadecimal digits; the decoded bytes are not valid UTF-8.

## escape-html

`text -> http/escape-html`

Replaces `&`, `<`, `>`, `"` and `'` with their HTML entities. Pass anything that came from a request through it before putting it into a page.

```
"<b>Tom & Jerry</b>" -> http/escape-html -> io/print-line   ~ &lt;b&gt;Tom &amp; Jerry&lt;/b&gt;
```

## cookies

`request -> http/cookies`

Returns the cookies the client sent in its `Cookie` header, as a hashmap from names to values. A value in double quotes loses them. When a name appears twice, the first value is kept, since browsers send the cookie for the most specific path first. Pieces without `=` or without a name are skipped, and a request without the header gives `{}`. Values are returned as sent, without percent-decoding.

```
request -> http/cookies -> hashmap/at-or "session" nothing => token
```

Errors: the input is not a hashmap; its `cookie` header is not a string.

## set-cookie

`response -> http/set-cookie name value options`

Adds a `Set-Cookie` header to the response and returns the response, so calls chain. A cookie already set on the response stays: each call adds one header line.

`options` is a hashmap; pass `{}` for the defaults. The defaults are for a session cookie: available on the whole site, hidden from JavaScript in the page, and not sent with requests that other sites start, which stops them from submitting the app's forms as the person logged in.

| Option | Default | Sends |
| --- | --- | --- |
| `"path"` | `"/"` | `Path=/` |
| `"domain"` | none | `Domain=...` |
| `"max-age"` | none: the cookie lasts until the browser closes | `Max-Age=...`, in seconds; `0` deletes the cookie |
| `"http-only"` | `yes` | `HttpOnly` |
| `"secure"` | `no` | `Secure`: sent only over HTTPS, which `http/serve` does not speak |
| `"same-site"` | `"Lax"` | `SameSite=Lax`; also `"Strict"` or `"None"` |

```
"/" -> http/redirect -> http/set-cookie "session" token {"max-age": 604800}
~ set-cookie: session=...; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax

"/login" -> http/redirect -> http/set-cookie "session" "" {"max-age": 0}   ~ logs out
```

Errors: the response is not a hashmap, or its `headers` is not one; the name is not a valid header token; the value has characters a cookie cannot hold (spaces, double quotes, commas, semicolons, backslashes, or anything outside visible ASCII), so encode such values first; an option is unknown or has the wrong type; `path` or `domain` contains a semicolon or a control character; `same-site` is not `"Strict"`, `"Lax"` or `"None"`; `same-site` is `"None"` without `secure`, which browsers refuse.
