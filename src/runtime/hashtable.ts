export interface KeyOps<K> {
  hash: (key: K) => number;
  equals: (a: K, b: K) => boolean;
}

interface Entry<K, V> {
  hash: number;
  key: K;
  value: V;
}

const EMPTY = -1;
const DELETED = -2;
const INITIAL_CAPACITY = 8;
const PERTURB_SHIFT = 5;

function newIndex(capacity: number): Int32Array {
  return new Int32Array(capacity).fill(EMPTY);
}

export class HashTable<K, V> {
  private readonly ops: KeyOps<K>;
  private slots: Array<Entry<K, V> | null>;
  private index: Int32Array;
  private capacity: number;
  private live: number;
  private deleted: number;

  constructor(ops: KeyOps<K>) {
    this.ops = ops;
    this.slots = [];
    this.capacity = INITIAL_CAPACITY;
    this.index = newIndex(INITIAL_CAPACITY);
    this.live = 0;
    this.deleted = 0;
  }

  get size(): number {
    return this.live;
  }

  get(key: K): V | undefined {
    const entry = this.entryAtSlot(this.findSlot(this.hashOf(key), key));
    return entry === null ? undefined : entry.value;
  }

  has(key: K): boolean {
    return this.findSlot(this.hashOf(key), key) >= 0;
  }

  set(key: K, value: V): void {
    const hash = this.hashOf(key);
    const existing = this.entryAtSlot(this.findSlot(hash, key));
    if (existing !== null) {
      existing.value = value;
      return;
    }
    // Tombstoned entries still occupy probe chains, so they count toward the
    // load that forces a rebuild; otherwise a churn of insert/delete on a
    // small table would fill the index with tombstones and probes would never
    // hit an empty slot.
    if ((this.live + this.deleted + 1) * 3 >= this.capacity * 2) {
      this.rebuild(this.live + 1);
    }
    const slot = this.findInsertSlot(hash);
    this.index[slot] = this.slots.length;
    this.slots.push({ hash, key, value });
    this.live++;
  }

  delete(key: K): boolean {
    const slot = this.findSlot(this.hashOf(key), key);
    if (slot < 0) {
      return false;
    }
    const pos = this.index[slot] ?? EMPTY;
    this.index[slot] = DELETED;
    this.slots[pos] = null;
    this.live--;
    this.deleted++;
    return true;
  }

  clear(): void {
    this.slots = [];
    this.capacity = INITIAL_CAPACITY;
    this.index = newIndex(INITIAL_CAPACITY);
    this.live = 0;
    this.deleted = 0;
  }

  keys(): K[] {
    const out: K[] = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        out.push(entry.key);
      }
    }
    return out;
  }

  values(): V[] {
    const out: V[] = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        out.push(entry.value);
      }
    }
    return out;
  }

  entries(): Array<[K, V]> {
    const out: Array<[K, V]> = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        out.push([entry.key, entry.value]);
      }
    }
    return out;
  }

  clone(): HashTable<K, V> {
    const copy = new HashTable<K, V>(this.ops);
    copy.slots = this.slots.map((entry) => (entry === null ? null : { ...entry }));
    copy.index = this.index.slice();
    copy.capacity = this.capacity;
    copy.live = this.live;
    copy.deleted = this.deleted;
    return copy;
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const entry of this.slots) {
      if (entry !== null) {
        yield [entry.key, entry.value];
      }
    }
  }

  private hashOf(key: K): number {
    return this.ops.hash(key) >>> 0;
  }

  private entryAt(pos: number): Entry<K, V> | null {
    return this.slots[pos] ?? null;
  }

  private entryAtSlot(slot: number): Entry<K, V> | null {
    return slot < 0 ? null : this.entryAt(this.index[slot] ?? EMPTY);
  }

  private findSlot(hash: number, key: K): number {
    const mask = this.capacity - 1;
    let slot = hash & mask;
    let perturb = hash;
    for (;;) {
      const pos = this.index[slot] ?? EMPTY;
      if (pos === EMPTY) {
        return -1;
      }
      if (pos !== DELETED) {
        const entry = this.entryAt(pos);
        if (entry !== null && entry.hash === hash && this.ops.equals(entry.key, key)) {
          return slot;
        }
      }
      perturb >>>= PERTURB_SHIFT;
      slot = (slot * 5 + perturb + 1) & mask;
    }
  }

  private findInsertSlot(hash: number): number {
    const mask = this.capacity - 1;
    let slot = hash & mask;
    let perturb = hash;
    for (;;) {
      const pos = this.index[slot] ?? EMPTY;
      if (pos === EMPTY || pos === DELETED) {
        return slot;
      }
      perturb >>>= PERTURB_SHIFT;
      slot = (slot * 5 + perturb + 1) & mask;
    }
  }

  private rebuild(minimumLive: number): void {
    let capacity = INITIAL_CAPACITY;
    while (capacity < minimumLive * 3) {
      capacity *= 2;
    }
    const compacted: Array<Entry<K, V>> = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        compacted.push(entry);
      }
    }
    this.slots = compacted;
    this.capacity = capacity;
    this.index = newIndex(capacity);
    this.deleted = 0;
    compacted.forEach((entry, pos) => {
      this.index[this.findInsertSlot(entry.hash)] = pos;
    });
  }
}
