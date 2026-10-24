# Serve HTTP from a slopersons module over sockets

## Status

Proposed

## Context

The project owner wants small web apps written in slopersons, starting from sockets and building HTTP on top ([Expose TCP through a socket module whose connections are streams](./202610241616-expose-tcp-through-a-socket-module-whose-connections-are-streams.md)). A program handles one connection at a time ([Make socket calls block by handing them to the main thread](./202610241615-make-socket-calls-block-by-handing-them-to-the-main-thread.md)). The owner agreed to a handler that takes a request hashmap and returns a response hashmap, served from a listener. They chose arrays for query names given more than once.

## Decision

- **Where it lives:** `http` is a standard library module written in slopersons, `src/stdlib/http.slop`, like `json`. It uses `socket`, `stream` and one new builtin, `string/byte-length`, for `Content-Length`.
- **Serving:** `listener -> http/serve handler` loops forever. For each connection it reads one request, calls the handler, writes the response and closes the connection. Taking a listener rather than a host and port leaves the program in charge of where it listens, and lets tests use port 0.
- **Building blocks:** `http/read-request` and `http/write-response` are exported, so a program can write its own loop. They work on any stream, so parsing is tested on files holding raw requests.
- **Requests** are hashmaps with:
  - `method` and `target`;
  - `path`, percent-decoded;
  - `query`: a name given once has a string, a name given more than once has an array of its values, as with Node's `querystring`;
  - `headers`, with names in lower case and repeated headers joined with `", "`;
  - `body`, read by `Content-Length`.
- **Responses** are hashmaps with `status`, `headers` and `body`, all optional.
  - `http` sets `content-length` and `connection: close` itself.
  - A body without a content type gets `text/plain; charset=utf-8`.
  - Header values with line breaks are refused, so request data cannot inject headers.
- **Helpers:** `http/text`, `http/html`, `http/json` and `http/redirect` (303) build responses. `http/escape-html` and `http/parse-form` cover the two jobs every app otherwise writes for itself.
- **Failures:**
  - a handler that fails, or returns something that is not a valid response, gets a 500 answer, and the request and the error with its position go to standard error;
  - a request that cannot be accepted gets 400, 411, 413, 431 or 505 with the reason, and the handler is not called.
- **Limits** keep one client from holding the one-at-a-time server or its memory:
  - 16 KiB and 100 header lines for the request head;
  - 1 MiB for a body;
  - 1 second for the request line to start arriving;
  - 10 seconds for each read and write after that.

  A client that connects and sends nothing, which browsers do with connections opened ahead of time, is dropped after a second.
- **Not supported:**
  - keep-alive: every response closes its connection;
  - chunked request bodies: answered with 411;
  - targets that are not paths starting with `/`;
  - HTTP versions other than 1.0 and 1.1.

Rejected:

- **Node's `http` module at the boundary.** The owner wants HTTP written over sockets.
- **Keep-alive.** A connection held open between requests would block every other client.
- **A request type, or responses given as bare strings.** Hashmaps print, compare and can be written as literals in tests. One response shape is simpler than two.
- **Query values that are always arrays.** Every handler would have to unwrap single values. The owner chose arrays only for repeated names.
- **A router.** Branching on `path` is enough for small apps. A router can be added once an app shows what it needs.
- **The 30-second socket default for the first line of a request.** A browser's unused connection would freeze the server for half a minute.

## Consequences

- **Handlers must check repeated names:** a query value can be a string or an array, so a handler that cares checks with `type-of`.
- **Slow first lines are dropped:** a client whose request line starts more than a second after it connects is dropped. Every real HTTP client sends the request at once, but someone typing a request by hand will not get through.
- **Idle connections still cost time:** each one waiting ahead of a real request costs up to a second, since the server cannot tell them apart before reading. Serving only connections that have sent something would need a new accept operation in the bridge.
- **Binary bodies are out of reach:** uploads cannot be received until a bytes type exists.
