export type Comparator<T> = (a: T, b: T) => number;

export function stableSort<T>(items: readonly T[], compare: Comparator<T>): T[] {
  const result = items.slice();
  if (result.length < 2) {
    return result;
  }
  const scratch = result.slice();
  sortInto(scratch, result, 0, result.length, compare);
  return result;
}

function sortInto<T>(src: T[], dst: T[], lo: number, hi: number, compare: Comparator<T>): void {
  if (hi - lo < 2) {
    return;
  }
  const mid = (lo + hi) >>> 1;
  sortInto(dst, src, lo, mid, compare);
  sortInto(dst, src, mid, hi, compare);
  merge(src, dst, lo, mid, hi, compare);
}

function merge<T>(src: T[], dst: T[], lo: number, mid: number, hi: number, compare: Comparator<T>): void {
  let left = lo;
  let right = mid;
  let out = lo;
  while (left < mid && right < hi) {
    const a = src[left] as T;
    const b = src[right] as T;
    if (compare(a, b) <= 0) {
      dst[out] = a;
      left++;
    } else {
      dst[out] = b;
      right++;
    }
    out++;
  }
  while (left < mid) {
    dst[out] = src[left] as T;
    left++;
    out++;
  }
  while (right < hi) {
    dst[out] = src[right] as T;
    right++;
    out++;
  }
}
