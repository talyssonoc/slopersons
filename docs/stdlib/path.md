# Path builtins

The `path` module builds paths as strings and never touches the file system. Paths use `/` as the separator.

## join

`path -> path/join part ...`

Joins `path` and one or more parts with a single `/` between them and returns the result. A part that starts with `/` is absolute and replaces everything before it, as in Python's `os.path.join`, so a path someone typed in full is kept as it is. `.` and `..` are left in place.

```
"data" -> path/join "users" "ada.json" -> io/print-line   ~ data/users/ada.json
"data" -> path/join "/etc/hosts" -> io/print-line         ~ /etc/hosts
```

Errors: the path or a part is not a string (`` each part given to `path/join` must be a string, got an int ``).

## parent

`path -> path/parent`

Returns the directory part of `path`, everything before its last name, as Node's `path.dirname` does. A trailing `/` is ignored, a path with no directory gives `"."`, and `"/"` gives `"/"`.

```
"data/users/ada.json" -> path/parent -> io/print-line   ~ data/users
"ada.json" -> path/parent -> io/print-line              ~ .
"/" -> path/parent -> io/print-line                     ~ /
```

Errors: the path is not a string.

## this-directory

`path/this-directory -> do`

Returns the absolute path of the directory that holds the `.slop` file the call is written in, like Node's `__dirname`. Inside a module it is the module's directory, even when one of the module's procedures is called from another file. In the REPL, where code has no file, it is the working directory. It takes no input, so it is called through `do`.

Relative paths given to `file/*` are resolved against the working directory, the directory `slopersons` was started in. To reach a file that sits next to the program wherever it is started from, build the path from `path/this-directory`:

```
path/this-directory -> do -> path/join "settings.json" -> file/read => settings
```
