export type Comparator<Item> = (left: Item, right: Item) => number;

export function stableSort<Item>(items: readonly Item[], compare: Comparator<Item>): Item[] {
  const result = items.slice();
  if (result.length < 2) {
    return result;
  }
  const scratch = result.slice();
  sortInto(scratch, result, 0, result.length, compare);
  return result;
}

function sortInto<Item>(source: Item[], dst: Item[], low: number, high: number, compare: Comparator<Item>): void {
  if (high - low < 2) {
    return;
  }
  const middle = (low + high) >>> 1;
  sortInto(dst, source, low, middle, compare);
  sortInto(dst, source, middle, high, compare);
  merge(source, dst, low, middle, high, compare);
}

function merge<Item>(source: Item[], dst: Item[], low: number, middle: number, high: number, compare: Comparator<Item>): void {
  let left = low;
  let right = middle;
  let out = low;
  while (left < middle && right < high) {
    const first = source[left] as Item;
    const second = source[right] as Item;
    if (compare(first, second) <= 0) {
      dst[out] = first;
      left++;
    } else {
      dst[out] = second;
      right++;
    }
    out++;
  }
  while (left < middle) {
    dst[out] = source[left] as Item;
    left++;
    out++;
  }
  while (right < high) {
    dst[out] = source[right] as Item;
    right++;
    out++;
  }
}
