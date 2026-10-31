/** Binary min-heap on (priority, insertion order) so ties break deterministically (FIFO). */
export class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];
  private seqs: number[] = [];
  private counter = 0;

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.prios.push(priority);
    this.seqs.push(this.counter++);
    this.up(this.items.length - 1);
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.length - 1;
    this.swap(0, last);
    this.items.pop();
    this.prios.pop();
    this.seqs.pop();
    if (last > 0) this.down(0);
    return top;
  }

  private less(a: number, b: number): boolean {
    return this.prios[a] < this.prios[b] || (this.prios[a] === this.prios[b] && this.seqs[a] < this.seqs[b]);
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
    [this.seqs[a], this.seqs[b]] = [this.seqs[b], this.seqs[a]];
  }

  private up(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private down(i: number): void {
    const n = this.items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
