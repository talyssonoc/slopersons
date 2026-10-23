# File builtins

The `file` module works on paths in the file system. Every function takes the path as its piped value: `"notes.txt" -> file/read`, `"out.txt" -> file/write text`. A relative path is resolved against the working directory the program was started in, not against the program's file. Text is read and written as UTF-8.

`file/open` returns a [stream](stream.md) for reading or writing a file a piece at a time; `file/read`, `file/write` and `file/append` handle a whole file in one call.

Failures are runtime errors that `attempt` can handle. Their messages name the operation, the path and the reason: `cannot open "notes.txt": no such file or directory`, `cannot open "photos": it is a directory`, `cannot remove "notes.txt": permission denied`. A path that is not a string is reported as `` the path of `file/read` must be a string, got an int ``.

## open

`path -> file/open mode`

Opens the file at `path` and returns a stream. `mode` is one of four words:

| Mode | Reads | Writes | When the file exists | When it does not |
| --- | --- | --- | --- | --- |
| `"read"` | yes | no | reads from the start | error |
| `"write"` | no | yes | empties it first | creates it |
| `"append"` | no | yes, always at the end | keeps the content | creates it |
| `"read-write"` | yes | yes | keeps the content, starts at the beginning | error |

A `"read-write"` stream has one position for reads and writes: a write replaces the bytes at the position and moves past them, and the next read continues after what was written. Only reading and writing move the position.

```
"notes.txt" -> file/open "read" => notes
notes -> stream/read-line -> io/print-line   ~ the first line of notes.txt
notes -> stream/close
```

Errors: `mode` is not one of the four words (`` the mode of `file/open` must be "read", "write", "append" or "read-write", got "rw" ``); the path is a directory; the file, or a directory on the way to it, does not exist; permission is denied.

## read

`path -> file/read`

Returns the whole content of the file as a string. `string/lines` splits it into lines; a stream from `file/open` reads a file too large to hold at once.

```
"notes.txt" -> file/read -> string/lines -> array/length -> io/print-line   ~ the number of lines
```

Errors: those of `file/open` with `"read"`; the content is not valid UTF-8 (`cannot read "photo.jpg": it is not valid UTF-8 text (invalid byte at offset 0)`).

## write

`path -> file/write value`

Replaces the content of the file with the printed form of `value`, creating the file when it does not exist, and returns `path`.

```
"greeting.txt" -> file/write "hello\n" -> file/read -> io/print   ~ hello
```

Errors: those of `file/open` with `"write"`; the operating system cannot write the file.

## append

`path -> file/append value`

Adds the printed form of `value` to the end of the file, creating the file when it does not exist, and returns `path`.

```
"log.txt" -> file/append "first\n" -> file/append "second\n"
```

## exists

`path -> file/exists`

Returns `yes` when something exists at `path`, a file or a directory, and `no` otherwise, including when the path cannot be examined.

```
"notes.txt" -> file/exists -> io/print-line   ~ yes
```

## is-directory

`path -> file/is-directory`

Returns `yes` when `path` is a directory.

```
"." -> file/is-directory -> io/print-line     ~ yes
```

## remove

`path -> file/remove`

Deletes the file at `path` and returns `nothing`. It does not remove directories.

```
"greeting.txt" -> file/remove
```

Errors: nothing exists at the path; the path is a directory (`cannot remove "photos": it is a directory`); permission is denied.

## list

`path -> file/list`

Returns the names of the entries in the directory at `path`, files and directories alike, as an array of strings sorted by code point. The names do not include `path`.

```
"." -> file/list -> io/print-line   ~ ["log.txt" "notes.txt"]
```

Errors: the path is not a directory (`cannot list "notes.txt": it is not a directory`); it does not exist.
