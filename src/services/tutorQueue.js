/**
 * AIチューターの質問を1件ずつ処理する待ち行列。
 * 生成中の質問が1番目、その後ろに並んだ順で 2, 3, ... となる。
 */
class TutorQueue {
  constructor() {
    this.active = null;
    this.waiting = [];
    this.nextId = 1;
  }

  enter() {
    const entry = {
      id: this.nextId++,
      state: "waiting",
      waiters: []
    };

    if (!this.active) {
      this.active = entry;
      entry.state = "active";
    } else {
      this.waiting.push(entry);
    }

    const queue = this;
    return {
      get status() {
        if (entry.state === "active") return "generating";
        return entry.state;
      },
      get position() {
        if (queue.active === entry) return 1;
        const index = queue.waiting.indexOf(entry);
        if (index === -1) return null;
        return index + (queue.active ? 2 : 1);
      },
      waitForChange: () => this._waitForChange(entry),
      cancel: () => this._cancel(entry),
      finish: () => this._finish(entry)
    };
  }

  _waitForChange(entry) {
    if (entry.state !== "waiting") return Promise.resolve();
    return new Promise((resolve) => {
      if (entry.state !== "waiting") {
        resolve();
        return;
      }
      entry.waiters.push(resolve);
    });
  }

  _wake(entry) {
    const pending = entry.waiters.splice(0);
    for (const resolve of pending) resolve();
  }

  _wakeAll(entries) {
    for (const entry of entries) this._wake(entry);
  }

  _cancel(entry) {
    if (entry.state === "done" || entry.state === "cancelled") return;

    if (entry.state === "waiting") {
      this.waiting = this.waiting.filter((item) => item !== entry);
      entry.state = "cancelled";
      this._wake(entry);
      this._wakeAll(this.waiting);
      return;
    }

    entry.state = "cancelled";
    this._wake(entry);
  }

  _finish(entry) {
    if (entry.state === "done") return;

    const wasActive = this.active === entry;
    if (!wasActive) {
      this.waiting = this.waiting.filter((item) => item !== entry);
    }

    entry.state = "done";
    this._wake(entry);

    if (!wasActive) {
      this._wakeAll(this.waiting);
      return;
    }

    const next = this.waiting.shift() || null;
    this.active = next;
    if (next) {
      next.state = "active";
      this._wake(next);
    }
    this._wakeAll(this.waiting);
  }
}

module.exports = new TutorQueue();
