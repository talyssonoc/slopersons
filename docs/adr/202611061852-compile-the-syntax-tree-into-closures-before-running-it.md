# Compile the syntax tree into closures before running it

## Status

Proposed

## Context

The interpreter evaluated programs by walking the syntax tree: `evaluateExpression` and `execStatement` switched on each node's kind every time the node ran, `evalBinary` switched on the operator, and a procedure value held its body as syntax-tree statements. A profile of a 3,000,000-step arithmetic loop attributed about a quarter of its time to that dispatch: entering the evaluator, the switch, and choosing the operator by name. Everything a node needs to decide that (its kind, its operator, its literal value) is known once the program is parsed.

## Decision

Before running a program, `runIn` compiles it once: `compileBlock`, `compileStatement`, `compileExpression`, `compileStep` and `compileBinary` turn each node into a JavaScript function of the environment that does what the node means. The dispatch on kind and operator happens at compile time; literals become their value once; each comparison and arithmetic operator gets its own function, which handles two ints directly and leaves every other case to `compareValues` and `arithmetic`, where the rules and errors are. Procedure and lambda values carry their compiled body (`ProcedureValue.run`) instead of the statements. Names are still looked up by name in the environment.

Alternatives considered:

- **Keep the tree walker and tune it** (reordering the switch, caching literals). Reordering gained about 3.5% on the loop; caching literals in a `WeakMap` made it slower, because the lookup costs more than the allocation it saves.
- **Compile to bytecode for a loop over instructions.** Faster in principle, but it needs a stack machine and a compiler from a tree-shaped language to it, a much larger change; closures keep the structure of the evaluator, so each function can be checked against what the tree walker did.
- **Generate JavaScript source and `eval` it.** Possibly the fastest, but every slopersons error must keep its message and position, and generated code would make the interpreter harder to read and debug.

## Consequences

- On one development machine, after the 65 ms start-up, a 3,000,000-step loop ran in about 200 ms instead of 417 ms and `fib 27` in about 50 ms instead of 103 ms.
- A program is compiled again on each `runIn`, which the REPL calls once per entry; compiling is linear in the program's size.
- Each closure must keep the evaluation order of `docs/semantics.md` and the errors of the tree walker; `test/interpreter.test.ts` pins the order of callee and arguments and of literal items and entries.
- A literal shares one value object across evaluations, which relies on scalar values never being changed in place.
- Recursion still reaches the call depth limit of 10,000 before the 256 MB stack of [Run programs on a worker thread with a 256 MB stack](./202610231558-run-programs-on-a-worker-thread-with-a-256-mb-stack.md) runs out.
- Variable lookup by name through a chain of `Map`s is now the largest remaining cost of a loop, about a quarter of its time.
