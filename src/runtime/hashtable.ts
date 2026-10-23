export interface KeyOperations<Key> {
  hash: (key: Key) => number;
  equals: (left: Key, right: Key) => boolean;
}

interface Entry<Key, Value> {
  hash: number;
  key: Key;
  value: Value;
}

const EMPTY = -1;
const DELETED = -2;
const INITIAL_CAPACITY = 8;
const PERTURB_SHIFT = 5;

function newIndex(capacity: number): Int32Array {
  return new Int32Array(capacity).fill(EMPTY);
}

export class HashTable<Key, Value> {
  private readonly operations: KeyOperations<Key>;
  private slots: Array<Entry<Key, Value> | null>;
  private index: Int32Array;
  private capacity: number;
  private live: number;
  private deleted: number;

  constructor(operations: KeyOperations<Key>) {
    this.operations = operations;
    this.slots = [];
    this.capacity = INITIAL_CAPACITY;
    this.index = newIndex(INITIAL_CAPACITY);
    this.live = 0;
    this.deleted = 0;
  }

  get size(): number {
    return this.live;
  }

  get(key: Key): Value | undefined {
    const entry = this.entryAtSlot(this.findSlot(this.hashOf(key), key));
    return entry === null ? undefined : entry.value;
  }

  has(key: Key): boolean {
    return this.findSlot(this.hashOf(key), key) >= 0;
  }

  set(key: Key, value: Value): void {
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

  delete(key: Key): boolean {
    const slot = this.findSlot(this.hashOf(key), key);
    if (slot < 0) {
      return false;
    }
    const position = this.index[slot] ?? EMPTY;
    this.index[slot] = DELETED;
    this.slots[position] = null;
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

  keys(): Key[] {
    const out: Key[] = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        out.push(entry.key);
      }
    }
    return out;
  }

  values(): Value[] {
    const out: Value[] = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        out.push(entry.value);
      }
    }
    return out;
  }

  entries(): Array<[Key, Value]> {
    const out: Array<[Key, Value]> = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        out.push([entry.key, entry.value]);
      }
    }
    return out;
  }

  clone(): HashTable<Key, Value> {
    const copy = new HashTable<Key, Value>(this.operations);
    copy.slots = this.slots.map((entry) => (entry === null ? null : { ...entry }));
    copy.index = this.index.slice();
    copy.capacity = this.capacity;
    copy.live = this.live;
    copy.deleted = this.deleted;
    return copy;
  }

  *[Symbol.iterator](): IterableIterator<[Key, Value]> {
    for (const entry of this.slots) {
      if (entry !== null) {
        yield [entry.key, entry.value];
      }
    }
  }

  private hashOf(key: Key): number {
    return this.operations.hash(key) >>> 0;
  }

  private entryAt(position: number): Entry<Key, Value> | null {
    return this.slots[position] ?? null;
  }

  private entryAtSlot(slot: number): Entry<Key, Value> | null {
    return slot < 0 ? null : this.entryAt(this.index[slot] ?? EMPTY);
  }

  private findSlot(hash: number, key: Key): number {
    const mask = this.capacity - 1;
    let slot = hash & mask;
    let perturb = hash;
    for (;;) {
      const position = this.index[slot] ?? EMPTY;
      if (position === EMPTY) {
        return -1;
      }
      if (position !== DELETED) {
        const entry = this.entryAt(position);
        if (entry !== null && entry.hash === hash && this.operations.equals(entry.key, key)) {
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
      const position = this.index[slot] ?? EMPTY;
      if (position === EMPTY || position === DELETED) {
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
    const compacted: Array<Entry<Key, Value>> = [];
    for (const entry of this.slots) {
      if (entry !== null) {
        compacted.push(entry);
      }
    }
    this.slots = compacted;
    this.capacity = capacity;
    this.index = newIndex(capacity);
    this.deleted = 0;
    compacted.forEach((entry, position) => {
      this.index[this.findInsertSlot(entry.hash)] = position;
    });
  }
}
