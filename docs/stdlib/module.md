# Module builtins

A module value is what `use` returns for a `.slop` file, and what the names of the builtin modules (`io`, `array`, `math` and the others listed in [core.md](core.md)) are bound to. It has type `module`, prints as `<module name>`, where the name is the file name without `.slop` or the builtin module's name, and is equal only to itself. A member is read with a qualified name, `geometry/pi`, or by string with `module/at`; members are read-only.

```
"./lib/geometry" -> use => geometry
geometry -> io/print-line                   ~ <module geometry>
geometry -> module/names -> io/print-line   ~ ["pi" "circle-area" "square-area" "describe"]
io -> module/names -> io/print-line         ~ ["print-line" "print" "read-line"]
```

## at

`module -> module/at "name"`

Returns the exported member named by the string. This is how a member whose name is computed at run time is reached.

```
geometry -> module/at "pi" -> io/print-line              ~ 3.14159
"circle-area" => which
2.0 -> (geometry -> module/at which) -> io/print-line   ~ 12.56636
```

Errors: the input is not a module; the name is not a string; the module has no exported member of that name.

## has

`module -> module/has "name"`

Returns `yes` when the module exports the name.

```
geometry -> module/has "pi" -> io/print-line      ~ yes
geometry -> module/has "secret" -> io/print-line  ~ no
```

Errors: the input is not a module; the name is not a string.

## names

`module -> module/names`

Returns the exported names as an array of strings, in `export` order for a file and in definition order for a builtin module.

```
math -> module/names -> io/print-line   ~ ["abs" "pow" "sqrt" "min" "max" "clamp" "sign"]
```

Errors: the input is not a module.

## path

`module -> module/path`

Returns the file the module was loaded from: relative to the working directory when the file is under it, absolute otherwise. A builtin module has no file and gives `<builtin name>`.

```
geometry -> module/path -> io/print-line  ~ lib/geometry.slop
io -> module/path -> io/print-line        ~ <builtin io>
```

Errors: the input is not a module.
