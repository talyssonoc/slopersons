import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.ts';
import { SlopersonsError } from '../src/errors.ts';
import { printProgram } from './helpers/ast-print.ts';

function printed(source: string): string {
  return printProgram(parse(source));
}

function parseError(source: string): SlopersonsError {
  try {
    parse(source);
  } catch (error) {
    if (error instanceof SlopersonsError) return error;
    throw error;
  }
  throw new Error('expected a parse error');
}

test('flows: binding, calls with arguments, bare values', () => {
  assert.equal(printed('5 => x'), '(flow 5 (=> x))');
  assert.equal(printed('x -> add 3 -> print-line'), '(flow x (-> add 3) (-> print-line))');
  assert.equal(printed('42'), '42');
  assert.equal(printed('x'), 'x');
  assert.equal(printed('total + n =>> total'), '(flow (+ total n) (=>> total))');
  assert.equal(printed('x -> f => y -> print-line'), '(flow x (-> f) (=> y) (-> print-line))');
});

test('a margin block attaches to the last step as a lambda, trailing names are its parameters', () => {
  assert.equal(printed('numbers -> each n\n| n -> print-line'), '(flow numbers (-> each (lambda [n] (flow n (-> print-line)))))');
  assert.equal(printed('xs -> fold 0 acc n\n| acc + n\n| acc'), '(flow xs (-> fold 0 (lambda [acc n] (+ acc n) acc)))');
  assert.equal(printed('3 -> repeat\n| "hi" -> print-line'), '(flow 3 (-> repeat (lambda [] (flow "hi" (-> print-line)))))');
});

test('inline lambda bodies run to the end of the line', () => {
  assert.equal(printed('numbers -> keep n | n > 10'), '(flow numbers (-> keep (lambda [n] (> n 10))))');
  assert.equal(printed('xs -> sort-by a b | a < b'), '(flow xs (-> sort-by (lambda [a b] (< a b))))');
  assert.equal(printed('xs -> each n | n > 2 ? n -> print-line : 0 -> print-line'), '(flow xs (-> each (lambda [n] (conditional (branch (> n 2) (flow n (-> print-line))) (else (flow 0 (-> print-line)))))))');
});

test('trailing-name rule: a variable argument before a lambda must be parenthesized', () => {
  assert.equal(printed('xs -> fold start acc n | acc + n'), '(flow xs (-> fold (lambda [start acc n] (+ acc n))))');
  assert.equal(printed('xs -> fold (start) acc n | acc + n'), '(flow xs (-> fold (flow start) (lambda [acc n] (+ acc n))))');
});

test('lambda literals: inline, block, zero-parameter in parentheses', () => {
  assert.equal(printed('n | n * 2'), '(lambda [n] (* n 2))');
  assert.equal(printed('a b | a < b'), '(lambda [a b] (< a b))');
  assert.equal(printed('n\n| n + k'), '(lambda [n] (+ n k))');
  assert.equal(printed('(| "hi" -> print-line) => greet'), '(flow (lambda [] (flow "hi" (-> print-line))) (=> greet))');
  assert.equal(printed('(n | n * 2) => double'), '(flow (lambda [n] (* n 2)) (=> double))');
});

test('procedures with block bodies, inline bodies, and lambda-returning bodies', () => {
  assert.equal(printed('proc describe n\n| n > 10 ? "big" -> out\n| "small"'), '(proc describe [n] (conditional (branch (> n 10) (flow "big" (-> out)))) "small")');
  assert.equal(printed('proc double n | n * 2'), '(proc double [n] (* n 2))');
  assert.equal(printed('proc adder k\n| n | n + k'), '(proc adder [k] (lambda [n] (+ n k)))');
  assert.equal(printed('proc adder k\n| n\n| | n + k'), '(proc adder [k] (lambda [n] (+ n k)))');
  assert.equal(printed('proc greet\n| "hi" -> print-line'), '(proc greet [] (flow "hi" (-> print-line)))');
});

test('while loops', () => {
  assert.equal(printed('while i < 3\n| i + 1 =>> i'), '(while (< i 3) (flow (+ i 1) (=>> i)))');
  assert.equal(printed('while i < 3 | i + 1 =>> i'), '(while (< i 3) (flow (+ i 1) (=>> i)))');
  assert.equal(printed('while yes\n| i >= 3 ? stop\n| i + 1 =>> i'), '(while yes (conditional (branch (>= i 3) (stop))) (flow (+ i 1) (=>> i)))');
  assert.equal(printed('while xs -> any n | n > 2\n| xs -> pop'), '(while (flow xs (-> any (lambda [n] (> n 2)))) (flow xs (-> pop)))');
});

test('conditionals in margin form with else-if and else lines', () => {
  const source = 'n > 100 ?\n| "big" -> print-line\n: n > 10 ?\n| "medium" -> print-line\n:\n| "small" -> print-line';
  assert.equal(printed(source), '(conditional (branch (> n 100) (flow "big" (-> print-line))) (branch (> n 10) (flow "medium" (-> print-line))) (else (flow "small" (-> print-line))))');
  assert.equal(printed('x ?\n| 1\n: 2'), '(conditional (branch x 1) (else 2))');
  assert.equal(printed('x ?\n| 1\n: y ? 2 : 3'), '(conditional (branch x 1) (branch y 2) (else 3))');
});

test('conditionals in inline form, chained, nested, and as expressions', () => {
  assert.equal(printed('n > 1 ? "many" : "one"'), '(conditional (branch (> n 1) "many") (else "one"))');
  assert.equal(printed('a ? 1 : b ? 2 : 3'), '(conditional (branch a 1) (branch b 2) (else 3))');
  assert.equal(printed('a ? b ? 1 : 2 : 3'), '(conditional (branch a (conditional (branch b 1) (else 2))) (else 3))');
  assert.equal(printed('(n > 1 ? "a" : "b") => s'), '(flow (conditional (branch (> n 1) "a") (else "b")) (=> s))');
  assert.equal(printed('x -> is-even ? "even" -> print-line'), '(conditional (branch (flow x (-> is-even)) (flow "even" (-> print-line))))');
});

test('continuation lines extend the flow above and keep their own blocks', () => {
  assert.equal(printed('numbers\n-> keep n | n > 10\n-> map n | n * 2\n-> print-line'), '(flow numbers (-> keep (lambda [n] (> n 10))) (-> map (lambda [n] (* n 2))) (-> print-line))');
  assert.equal(printed('numbers -> keep n\n| n > 10\n-> map n\n| n * 2\n-> print-line'), '(flow numbers (-> keep (lambda [n] (> n 10))) (-> map (lambda [n] (* n 2))) (-> print-line))');
  assert.equal(printed('x -> double\n-> is-even ?\n| "even" -> print-line'), '(conditional (branch (flow x (-> double) (-> is-even)) (flow "even" (-> print-line))))');
  assert.equal(printed('5\n=> x'), '(flow 5 (=> x))');
  assert.equal(printed('proc f\n| xs\n| -> map n | n * 2\n| -> print-line'), '(proc f [] (flow xs (-> map (lambda [n] (* n 2))) (-> print-line)))');
});

test('expression precedence and unary operators', () => {
  assert.equal(printed('1 + 2 * 3'), '(+ 1 (* 2 3))');
  assert.equal(printed('(1 + 2) * 3'), '(* (+ 1 2) 3)');
  assert.equal(printed('not a and b'), '(and (not a) b)');
  assert.equal(printed('a or b and c'), '(or a (and b c))');
  assert.equal(printed('-x * 2'), '(* (neg x) 2)');
  assert.equal(printed('2 - -1'), '(- 2 (neg 1))');
  assert.equal(printed('a = b'), '(= a b)');
  assert.equal(printed('a /= b'), '(/= a b)');
  assert.equal(printed('a <= b or c >= d'), '(or (<= a b) (>= c d))');
  assert.equal(printed('7 mod 2 = 1'), '(= (mod 7 2) 1)');
});

test('literals: arrays, maps, strings with interpolation, chars, booleans, nothing', () => {
  assert.equal(printed('[1 -2 (a - b) "x"]'), '[1 (neg 2) (- a b) "x"]');
  assert.equal(printed('{"a": 1  "b": (n | n * 2)}'), '(map ("a" 1) ("b" (lambda [n] (* n 2))))');
  assert.equal(printed('{}'), '(map )');
  assert.equal(printed('[]'), '[]');
  assert.equal(printed('"x is {x -> double}!"'), '(interpolation "x is " (flow x (-> double)) "!")');
  assert.equal(printed('"{n > 1 ? "many" : "one"}"'), '(interpolation (conditional (branch (> n 1) "many") (else "one")))');
  assert.equal(printed('[`a` yes no nothing 1.5]'), '[`a` yes no nothing 1.5]');
});

test('a parenthesized flow can be the callee', () => {
  assert.equal(printed('7 -> (ops -> at "sq")'), '(flow 7 (-> (flow ops (-> at "sq"))))');
  assert.equal(printed('7 -> (ops -> at "sq") 1 2'), '(flow 7 (-> (flow ops (-> at "sq")) 1 2))');
});

test('errors: blocks in the wrong place', () => {
  assert.match(parseError('n > 1 ? "a" -> print-line\n| x').message, /inline body cannot also take a block/);
  assert.match(parseError('5\n| x').message, /cannot take a block/);
  assert.match(parseError('x => y\n| z').message, /binding cannot take a block/);
  assert.match(parseError('xs -> each n | n\n| x').message, /already has an inline lambda/);
  assert.match(parseError('proc foo n | n\n| x').message, /cannot also take a block/);
  assert.match(parseError('proc foo').message, /needs a body/);
  assert.match(parseError('while x').message, /needs a body/);
  assert.match(parseError('x ?').message, /needs a body/);
  assert.match(parseError('| x').message, /block without a header/);
  assert.match(parseError('a\n| | b').message, /nested deeper/);
});

test('errors: else and continuation without a partner', () => {
  assert.match(parseError(': x').message, /without a preceding/);
  assert.match(parseError('x ?\n| 1\n: 2\n: 3').message, /already has a final/);
  assert.match(parseError('x ? 1 : 2 : 3').message, /unexpected `:`/);
  assert.match(parseError('-> print-line').message, /continues the flow above/);
  assert.match(parseError('x ?\n| 1\n-> print-line').message, /continues the flow above/);
});

test('errors: lambdas and colons in inline contexts', () => {
  assert.match(parseError('a ? xs -> each n | n -> print-line : 1 -> print-line').message, /wrap the lambda in parentheses/);
  assert.match(parseError('{"a": n | n * 2}').message, /wrapped in parentheses/);
  assert.equal(printed('x | y'), '(lambda [x] y)');
  assert.match(parseError('5 | y').message, /unexpected `\|`/);
});

test('errors: operators and operands', () => {
  const error = parseError('a\nx -1');
  assert.match(error.message, /spaces on both sides/);
  assert.deepEqual(error.position, { line: 2, col: 3 });
  assert.match(parseError('a < b < c').message, /cannot be chained/);
  assert.match(parseError('5 =>').message, /expected a name after `=>`/);
  assert.match(parseError('x -> 5').message, /expected a procedure name/);
  assert.match(parseError('x ->').message, /expected a procedure name after `->`, found end of line/);
  assert.match(parseError('(while x | y) => z').message, /is not a value/);
  assert.match(parseError('(stop) => z').message, /is not a value/);
  assert.match(parseError('stop 5').message, /unexpected `5`/);
  assert.match(parseError('{"a" 1}').message, /expected `:`/);
  assert.match(parseError('x 5').message, /unexpected `5`/);
  assert.match(parseError('1 +').message, /expected a value, found end of line/);
});

test('a program is a sequence of statements', () => {
  const source = '~ demo\n[3 8 15] => numbers\n0 => total\nnumbers -> each n\n| n mod 2 = 0 ? total + n =>> total\n"total: {total}" -> print-line';
  assert.equal(
    printed(source),
    [
      '(flow [3 8 15] (=> numbers))',
      '(flow 0 (=> total))',
      '(flow numbers (-> each (lambda [n] (conditional (branch (= (mod n 2) 0) (flow (+ total n) (=>> total)))))))',
      '(flow (interpolation "total: " total) (-> print-line))',
    ].join('\n'),
  );
});

test('attempt and recover in block, inline, mixed and expression forms', () => {
  assert.equal(printed('attempt\n| x -> risky\nrecover e\n| 0'), '(attempt (flow x (-> risky)) (recover e 0))');
  assert.equal(printed('attempt | x -> risky recover | 0'), '(attempt (flow x (-> risky)) (recover 0))');
  assert.equal(printed('attempt | x -> risky\nrecover e | 0'), '(attempt (flow x (-> risky)) (recover e 0))');
  assert.equal(printed('attempt | x -> risky recover e\n| 0'), '(attempt (flow x (-> risky)) (recover e 0))');
  assert.equal(printed('(attempt | x -> risky recover | 0) => n'), '(flow (attempt (flow x (-> risky)) (recover 0)) (=> n))');
  assert.equal(printed('attempt | xs -> each n | n -> risky recover | 0'), '(attempt (flow xs (-> each (lambda [n] (flow n (-> risky))))) (recover 0))');
  assert.equal(printed('attempt | a ? 1 : 2 recover | 0'), '(attempt (conditional (branch a 1) (else 2)) (recover 0))');
  assert.equal(printed('proc f\n| attempt | x\n| recover | 0'), '(proc f [] (attempt x (recover 0)))');
});

test('errors: attempt without recover, recover without attempt, and misplaced recover', () => {
  assert.match(parseError('attempt\n| x').message, /needs a `recover`/);
  assert.match(parseError('attempt | x').message, /needs a `recover`/);
  assert.match(parseError('recover e | 0').message, /without a preceding `attempt`/);
  assert.match(parseError('attempt').message, /needs a body/);
  assert.match(parseError('attempt\n| x\nrecover e | 0\nrecover | 1').message, /already has a `recover`/);
  assert.match(parseError('x -> f recover e | 0').message, /must follow an `attempt`/);
  assert.match(parseError('attempt | x\n| y').message, /cannot take a block/);
  assert.match(parseError('(attempt | x) => n').message, /needs a `recover` or an `always` on the same line/);
  assert.match(parseError('attempt\n| x\nrecover e').message, /needs a body/);
});

test('qualified names are expressions, callees and arguments, but never binding targets', () => {
  assert.equal(printed('5 -> geo/area'), '(flow 5 (-> geo/area))');
  assert.equal(printed('geo/area => area'), '(flow geo/area (=> area))');
  assert.equal(printed('x -> f geo/pi'), '(flow x (-> f geo/pi))');
  assert.equal(printed('a/b/c'), 'a/b/c');
  assert.equal(printed('xs -> each geo/x | 1'), '(flow xs (-> each geo/x (lambda [] 1)))');
  assert.match(parseError('1 => geo/x').message, /expected a name after `=>`/);
  assert.match(parseError('proc geo/f | 1').message, /expected a procedure name/);
});

test('export lists names and is only allowed at the top level', () => {
  assert.equal(printed('export area perimeter'), '(export area perimeter)');
  assert.match(parseError('export').message, /needs at least one name/);
  assert.match(parseError('export 5').message, /needs at least one name/);
  assert.match(parseError('proc f\n| export x').message, /only allowed at the top level/);
  assert.match(parseError('export x\n| y').message, /cannot take a block/);
});

test('always adds a cleanup body to attempt, with or without recover, in block and inline forms', () => {
  assert.equal(printed('attempt\n| x\nrecover e\n| 0\nalways\n| y'), '(attempt x (recover e 0) (always y))');
  assert.equal(printed('attempt\n| x\nalways\n| y'), '(attempt x (always y))');
  assert.equal(printed('attempt | x recover | 0 always | y'), '(attempt x (recover 0) (always y))');
  assert.equal(printed('attempt | x always | y'), '(attempt x (always y))');
  assert.equal(printed('attempt | x recover e | 0 always\n| y'), '(attempt x (recover e 0) (always y))');
  assert.equal(printed('attempt | x always\n| y'), '(attempt x (always y))');
  assert.equal(printed('(attempt | x always | y) => n'), '(flow (attempt x (always y)) (=> n))');
});

test('errors: always placement', () => {
  assert.match(parseError('always | y').message, /without a preceding `attempt`/);
  assert.match(parseError('attempt | x always | y\nalways | z').message, /already has an `always`/);
  assert.match(parseError('attempt | x always | y\nrecover | 0').message, /`recover` must come before `always`/);
  assert.match(parseError('x -> f always | y').message, /must follow an `attempt` or `recover` body/);
  assert.match(parseError('attempt\n| x\nalways').message, /`always` needs a body/);
  assert.match(parseError('attempt | x\n| y').message, /put `recover` or `always` on the same line/);
  assert.match(parseError('attempt | x').message, /needs a `recover` or an `always`/);
  assert.match(parseError('(attempt | x) => n').message, /needs a `recover` or an `always` on the same line/);
});
