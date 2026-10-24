# Socket builtins

For HTTP, the [http](http.md) module is built on this one.

The `socket` module opens TCP connections. A server listens on a host and port, then accepts clients one at a time; a client connects to a host and port. Either way a connection is a [stream](stream.md), so `stream/read-line`, `stream/read`, `stream/read-all`, `stream/write`, `stream/write-line`, `stream/flush` and `stream/close` work on it as they do on a file.

```
"127.0.0.1" -> socket/listen 8080 => listener
while yes
| listener -> socket/accept => connection
| attempt
| | connection -> stream/read-line => line
| | connection -> stream/write-line "you said: {line}"
| recover problem
| | io/stderr -> stream/write-line "connection failed: {problem}"
| always
| | connection -> stream/close
```

Every socket call waits until it is done: `socket/accept` until a client arrives, a read until data arrives, a write until the operating system has taken the data. A program therefore serves one connection at a time. Clients that connect while it is busy wait in a queue and are accepted in the order they arrived; at most 10 wait at once, and the connection of any client beyond that is reset straight away. Each waiting client waits for every client ahead of it, which is what the timeouts below protect.

Writes to a connection are buffered like writes to a file: they go out when 64 KiB have piled up, on `stream/flush`, on `stream/close`, before the next read from the same connection, and when the program ends. Reading first sends what was written, so a program that writes a question and reads the answer needs no flush. `stream/read-all` reads until the other side stops sending, which a client that keeps its connection open never does; `stream/read` reads a counted number of bytes instead.

Reads and writes on a connection time out after 30 seconds without progress, so one silent client cannot hold up a server forever; `socket/set-timeout` changes that per connection. `socket/accept` has no timeout.

Connections and listeners a program leaves open are closed when it ends, after what was written to the connections is sent. However the program ends (finishing, a runtime error, `exit`, Ctrl-C, or an internal interpreter error), every client is disconnected and its ports can be listened on again straight away; `socket/close` frees a listener's port while the program keeps running. A server loop like the one above runs until the program is stopped; Ctrl-C stops it the way `exit` does, even while it waits for a client (see [Ctrl-C](../cli.md#ctrl-c)).

Failures are runtime errors that `attempt` can handle. Their messages name the operation, the address and the reason: `cannot listen on 127.0.0.1:8080: the address is already in use`, `cannot connect to example.com:80: the connection was refused`, `cannot read the connection from 127.0.0.1:53114: nothing arrived within 30 seconds`, `cannot write the connection to example.com:80: the other side reset the connection`.

## listen

`host -> socket/listen port`

Starts listening for connections on `host` and `port` and returns a listener. The host decides who can connect: `"127.0.0.1"` only programs on the same machine, `"0.0.0.0"` anyone who can reach it on the network. Port `0` lets the operating system choose a free port; `socket/port` tells which one it chose.

A listener prints as `<listener 127.0.0.1:8080>`, `type-of` names it `listener`, and it is equal only to itself.

```
"127.0.0.1" -> socket/listen 0 => listener
listener -> io/print-line                       ~ <listener 127.0.0.1:52817>
```

Errors: the host is not a string; the port is not an int between 0 and 65535; the address is already in use; permission is denied (ports below 1024 need it on most systems); the host is not an address of this machine.

## accept

`listener -> socket/accept`

Waits for the next client and returns its connection: the one that has waited longest, or the next one to arrive. The connection prints as `<stream connection from 127.0.0.1:53114>`, with the client's address and port.

```
listener -> socket/accept => connection
connection -> stream/read-line -> io/print-line
```

Errors: the input is not a listener; the listener is closed (`cannot accept a connection on 127.0.0.1:8080: the listener is closed`).

## connect

`host -> socket/connect port`

Connects to a server and returns the connection, which prints as `<stream connection to example.com:80>`. Waits at most 30 seconds for the server to answer.

```
"example.com" -> socket/connect 80 => connection
connection -> stream/write "HEAD / HTTP/1.0\r\nHost: example.com\r\n\r\n"
connection -> stream/read-line -> io/print-line   ~ the status line, such as HTTP/1.1 200 OK
connection -> stream/close
```

Errors: the host is not a string; the port is not an int between 1 and 65535; the host is not found; the connection is refused; no answer within 30 seconds.

## port

`listener -> socket/port`

Returns the port a listener listens on, which is the one the operating system chose when it was given `0`.

```
"127.0.0.1" -> socket/listen 0 -> socket/port -> io/print-line   ~ 52817
```

## set-timeout

`connection -> socket/set-timeout milliseconds`

Sets how long each later read and write on the connection may wait before failing, and returns the connection. `milliseconds` is an int from 1 to 2147483647, or `nothing` to wait forever.

```
listener -> socket/accept -> socket/set-timeout 5000 => connection
attempt | connection -> stream/read-line => line
recover problem | problem -> io/print-line        ~ cannot read the connection from 127.0.0.1:53114: nothing arrived within 5 seconds
```

A read that times out leaves the connection usable, and a later read gets what arrives after it. A write that times out closes the connection, because part of what was written may already have been sent.

Errors: the input is not a connection (`` the input of `socket/set-timeout` must be a connection from `socket/accept` or `socket/connect`, got a stream ``); the timeout is not an int or `nothing`, or is out of range.

## close

`listener -> socket/close`

Stops listening and returns `nothing`. Clients still waiting to be accepted are disconnected. Closing a closed listener does nothing. A connection is closed with `stream/close`.

```
listener -> socket/close
```

Errors: the input is not a listener (`` the input of `socket/close` must be a listener, got a stream; close a connection with `stream/close` ``).
