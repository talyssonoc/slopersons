import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.ts';
import { SloError } from '../src/errors.ts';
import { printProgram } from './helpers/ast-print.ts';

function p(source: string): string {
  return printProgram(parse(source));
}

function parseError(source: string): SloError {
  try {
    parse(source);
  } catch (error) {
    if (error instanceof SloError) return error;
    throw error;
  }
  throw new Error('expected a parse error');
}

test('flows: binding, calls with arguments, bare values', () => {
  assert.equal(p('5 => x'), '(flow 5 (=> x))');
  assert.equal(p('x -> add 3 -> print-ln'), '(flow x (-> add 3) (-> print-ln))');
  assert.equal(p('42'), '42');
  assert.equal(p('x'), 'x');
  assert.equal(p('total + n =>> total'), '(flow (+ total n) (=>> total))');
  assert.equal(p('x -> f => y -> print-ln'), '(flow x (-> f) (=> y) (-> print-ln))');
});

test('a margin block attaches to the last step as a lambda, trailing names are its parameters', () => {
  assert.equal(p('numbers -> each n\n| n -> print-ln'), '(flow numbers (-> each (fn [n] (flow n (-> print-ln)))))');
  assert.equal(p('xs -> fold 0 acc n\n| acc + n\n| acc'), '(flow xs (-> fold 0 (fn [acc n] (+ acc n) acc)))');
  assert.equal(p('3 -> repeat\n| "hi" -> print-ln'), '(flow 3 (-> repeat (fn [] (flow "hi" (-> print-ln)))))');
});

test('inline lambda bodies run to the end of the line', () => {
  assert.equal(p('numbers -> keep n | n > 10'), '(flow numbers (-> keep (fn [n] (> n 10))))');
  assert.equal(p('xs -> sort-by a b | a < b'), '(flow xs (-> sort-by (fn [a b] (< a b))))');
  assert.equal(p('xs -> each n | n > 2 ? n -> print-ln : 0 -> print-ln'), '(flow xs (-> each (fn [n] (cond (branch (> n 2) (flow n (-> print-ln))) (else (flow 0 (-> print-ln)))))))');
});

test('trailing-name rule: a variable argument before a lambda must be parenthesized', () => {
  assert.equal(p('xs -> fold start acc n | acc + n'), '(flow xs (-> fold (fn [start acc n] (+ acc n))))');
  assert.equal(p('xs -> fold (start) acc n | acc + n'), '(flow xs (-> fold (flow start) (fn [acc n] (+ acc n))))');
});

test('lambda literals: inline, block, zero-parameter in parentheses', () => {
  assert.equal(p('n | n * 2'), '(fn [n] (* n 2))');
  assert.equal(p('a b | a < b'), '(fn [a b] (< a b))');
  assert.equal(p('n\n| n + k'), '(fn [n] (+ n k))');
  assert.equal(p('(| "hi" -> print-ln) => greet'), '(flow (fn [] (flow "hi" (-> print-ln))) (=> greet))');
  assert.equal(p('(n | n * 2) => double'), '(flow (fn [n] (* n 2)) (=> double))');
});

test('procedures with block bodies, inline bodies, and lambda-returning bodies', () => {
  assert.equal(p('proc describe n\n| n > 10 ? "big" -> out\n| "small"'), '(proc describe [n] (cond (branch (> n 10) (flow "big" (-> out)))) "small")');
  assert.equal(p('proc double n | n * 2'), '(proc double [n] (* n 2))');
  assert.equal(p('proc adder k\n| n | n + k'), '(proc adder [k] (fn [n] (+ n k)))');
  assert.equal(p('proc adder k\n| n\n| | n + k'), '(proc adder [k] (fn [n] (+ n k)))');
  assert.equal(p('proc greet\n| "hi" -> print-ln'), '(proc greet [] (flow "hi" (-> print-ln)))');
});

test('while loops', () => {
  assert.equal(p('while i < 3\n| i + 1 =>> i'), '(while (< i 3) (flow (+ i 1) (=>> i)))');
  assert.equal(p('while i < 3 | i + 1 =>> i'), '(while (< i 3) (flow (+ i 1) (=>> i)))');
  assert.equal(p('while yes\n| i >= 3 ? stop\n| i + 1 =>> i'), '(while yes (cond (branch (>= i 3) (stop))) (flow (+ i 1) (=>> i)))');
  assert.equal(p('while xs -> any n | n > 2\n| xs -> pop'), '(while (flow xs (-> any (fn [n] (> n 2)))) (flow xs (-> pop)))');
});

test('conditionals in margin form with else-if and else lines', () => {
  const source = 'n > 100 ?\n| "big" -> print-ln\n: n > 10 ?\n| "medium" -> print-ln\n:\n| "small" -> print-ln';
  assert.equal(p(source), '(cond (branch (> n 100) (flow "big" (-> print-ln))) (branch (> n 10) (flow "medium" (-> print-ln))) (else (flow "small" (-> print-ln))))');
  assert.equal(p('x ?\n| 1\n: 2'), '(cond (branch x 1) (else 2))');
  assert.equal(p('x ?\n| 1\n: y ? 2 : 3'), '(cond (branch x 1) (branch y 2) (else 3))');
});

test('conditionals in inline form, chained, nested, and as expressions', () => {
  assert.equal(p('n > 1 ? "many" : "one"'), '(cond (branch (> n 1) "many") (else "one"))');
  assert.equal(p('a ? 1 : b ? 2 : 3'), '(cond (branch a 1) (branch b 2) (else 3))');
  assert.equal(p('a ? b ? 1 : 2 : 3'), '(cond (branch a (cond (branch b 1) (else 2))) (else 3))');
  assert.equal(p('(n > 1 ? "a" : "b") => s'), '(flow (cond (branch (> n 1) "a") (else "b")) (=> s))');
  assert.equal(p('x -> is-even ? "even" -> print-ln'), '(cond (branch (flow x (-> is-even)) (flow "even" (-> print-ln))))');
});

test('continuation lines extend the flow above and keep their own blocks', () => {
  assert.equal(p('numbers\n-> keep n | n > 10\n-> map n | n * 2\n-> print-ln'), '(flow numbers (-> keep (fn [n] (> n 10))) (-> map (fn [n] (* n 2))) (-> print-ln))');
  assert.equal(p('numbers -> keep n\n| n > 10\n-> map n\n| n * 2\n-> print-ln'), '(flow numbers (-> keep (fn [n] (> n 10))) (-> map (fn [n] (* n 2))) (-> print-ln))');
  assert.equal(p('x -> double\n-> is-even ?\n| "even" -> print-ln'), '(cond (branch (flow x (-> double) (-> is-even)) (flow "even" (-> print-ln))))');
  assert.equal(p('5\n=> x'), '(flow 5 (=> x))');
  assert.equal(p('proc f\n| xs\n| -> map n | n * 2\n| -> print-ln'), '(proc f [] (flow xs (-> map (fn [n] (* n 2))) (-> print-ln)))');
});

test('expression precedence and unary operators', () => {
  assert.equal(p('1 + 2 * 3'), '(+ 1 (* 2 3))');
  assert.equal(p('(1 + 2) * 3'), '(* (+ 1 2) 3)');
  assert.equal(p('not a and b'), '(and (not a) b)');
  assert.equal(p('a or b and c'), '(or a (and b c))');
  assert.equal(p('-x * 2'), '(* (neg x) 2)');
  assert.equal(p('2 - -1'), '(- 2 (neg 1))');
  assert.equal(p('a = b'), '(= a b)');
  assert.equal(p('a /= b'), '(/= a b)');
  assert.equal(p('a <= b or c >= d'), '(or (<= a b) (>= c d))');
  assert.equal(p('7 mod 2 = 1'), '(= (mod 7 2) 1)');
});

test('literals: arrays, maps, strings with interpolation, chars, booleans, nothing', () => {
  assert.equal(p('[1 -2 (a - b) "x"]'), '[1 (neg 2) (- a b) "x"]');
  assert.equal(p('{"a": 1  "b": (n | n * 2)}'), '(map ("a" 1) ("b" (fn [n] (* n 2))))');
  assert.equal(p('{}'), '(map )');
  assert.equal(p('[]'), '[]');
  assert.equal(p('"x is {x -> double}!"'), '(interp "x is " (flow x (-> double)) "!")');
  assert.equal(p('"{n > 1 ? "many" : "one"}"'), '(interp (cond (branch (> n 1) "many") (else "one")))');
  assert.equal(p('[`a` yes no nothing 1.5]'), '[`a` yes no nothing 1.5]');
});

test('a parenthesized flow can be the callee', () => {
  assert.equal(p('7 -> (ops -> at "sq")'), '(flow 7 (-> (flow ops (-> at "sq"))))');
  assert.equal(p('7 -> (ops -> at "sq") 1 2'), '(flow 7 (-> (flow ops (-> at "sq")) 1 2))');
});

test('errors: blocks in the wrong place', () => {
  assert.match(parseError('n > 1 ? "a" -> print-ln\n| x').message, /inline body cannot also take a block/);
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
  assert.match(parseError('-> print-ln').message, /continues the flow above/);
  assert.match(parseError('x ?\n| 1\n-> print-ln').message, /continues the flow above/);
});

test('errors: lambdas and colons in inline contexts', () => {
  assert.match(parseError('a ? xs -> each n | n -> print-ln : 1 -> print-ln').message, /wrap the lambda in parentheses/);
  assert.match(parseError('{"a": n | n * 2}').message, /wrapped in parentheses/);
  assert.equal(p('x | y'), '(fn [x] y)');
  assert.match(parseError('5 | y').message, /unexpected `\|`/);
});

test('errors: operators and operands', () => {
  const error = parseError('a\nx -1');
  assert.match(error.message, /spaces on both sides/);
  assert.deepEqual(error.pos, { line: 2, col: 3 });
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
  const source = '~ demo\n[3 8 15] => numbers\n0 => total\nnumbers -> each n\n| n mod 2 = 0 ? total + n =>> total\n"total: {total}" -> print-ln';
  assert.equal(
    p(source),
    [
      '(flow [3 8 15] (=> numbers))',
      '(flow 0 (=> total))',
      '(flow numbers (-> each (fn [n] (cond (branch (= (mod n 2) 0) (flow (+ total n) (=>> total)))))))',
      '(flow (interp "total: " total) (-> print-ln))',
    ].join('\n'),
  );
});
