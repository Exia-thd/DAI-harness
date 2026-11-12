/** The canonical append-only trajectory ledger and its reversible lifecycle.
 *
 * `HarnessAdapter v1` already binds a resume token to `ledgerOffset` and
 * `ledgerHeadHash`, and `checkpoint()` already returns a `ledgerOffset` -- the
 * contract referenced a ledger that did not exist. This module is that ledger.
 *
 * Three properties are load-bearing, and each is a test rather than a claim:
 *
 * - **Reconstruction is deterministic.** Every event carries its own `atMs` and
 *   a hash over the previous head, so replaying a recorded sequence yields the
 *   identical head hash on any host, at any later time. Nothing is recomputed
 *   from the wall clock during a replay.
 * - **A terminal event is last and there is exactly one.** The closing path is
 *   the only writer of a terminal event, and it writes it after the disposers
 *   have run, so "no event after the terminal event" is an invariant with one
 *   writer instead of a rule every caller must remember.
 * - **Closing is idempotent.** `close`/`cancel`/`dispose` return the same
 *   receipt object on every later call and append nothing further, because a
 *   disposer that runs twice is how a lifecycle corrupts the resource it was
 *   meant to release.
 */

import { createHash } from 'node:crypto';

export const TRAJECTORY_LEDGER_SCHEMA = 'dai-harness-trajectory-ledger/v1' as const;

/** The chain anchor. The first event's `previousHash` is this, never absent, so
 * a truncated head cannot be mistaken for the start of the chain. */
export const TRAJECTORY_GENESIS_HASH = '0'.repeat(64);

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type TrajectoryEventKind =
  | 'session.started'
  | 'turn.started'
  | 'model.call'
  | 'tool.call'
  | 'approval.decided'
  | 'checkpoint.written'
  | 'cancellation.requested'
  | 'bounded.timed-out'
  | 'disposer.ran'
  | 'disposer.failed'
  | 'scope.closed'
  | 'quiescence.reached'
  | 'session.cancelled'
  | 'session.timed-out'
  | 'session.failed';

/** Kinds that seal the ledger. Only `LifecycleScope` closing writes one. */
export const TERMINAL_EVENT_KINDS: ReadonlySet<TrajectoryEventKind> = new Set([
  'quiescence.reached',
  'session.cancelled',
  'session.timed-out',
  'session.failed',
]);

const EVENT_KINDS: ReadonlySet<TrajectoryEventKind> = new Set([
  'session.started',
  'turn.started',
  'model.call',
  'tool.call',
  'approval.decided',
  'checkpoint.written',
  'cancellation.requested',
  'bounded.timed-out',
  'disposer.ran',
  'disposer.failed',
  'scope.closed',
  'quiescence.reached',
  'session.cancelled',
  'session.timed-out',
  'session.failed',
]);

export interface TrajectoryEvent {
  schema: typeof TRAJECTORY_LEDGER_SCHEMA;
  offset: number;
  kind: TrajectoryEventKind;
  atMs: number;
  payloadDigest: string;
  previousHash: string;
  hash: string;
}

export type CloseReason = 'quiescent' | 'cancelled' | 'timed-out';

export interface QuiescenceReceipt {
  schema: typeof TRAJECTORY_LEDGER_SCHEMA;
  scope: string;
  reason: CloseReason;
  detail: string | null;
  ledgerOffset: number;
  ledgerHeadHash: string;
  disposersRun: string[];
  disposersFailed: string[];
  atMs: number;
  receiptHash: string;
}

export class TrajectoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'TrajectoryError';
  }
}

/** A cancellable delay, injected so a timeout is testable without real time.
 *
 * `timer` hands back its own `cancel` because an uncancelled `setTimeout` keeps
 * the event loop alive: a bounded call that returned in time would otherwise
 * hold the process open for the rest of its budget.
 */
export interface Clock {
  now(): number;
  timer(milliseconds: number): { expiry: Promise<void>; cancel(): void };
}

export const systemClock: Clock = {
  now: () => Date.now(),
  timer: (milliseconds) => {
    let handle: NodeJS.Timeout | undefined;
    const expiry = new Promise<void>((resolveExpiry) => {
      handle = setTimeout(resolveExpiry, milliseconds);
    });
    return {
      expiry,
      cancel: () => {
        if (handle !== undefined) clearTimeout(handle);
      },
    };
  },
};

/** JSON with sorted keys, so a digest describes the value and not the order a
 * caller happened to build it in.
 *
 * `JSON.stringify` turns `NaN` and `Infinity` into `null`, which would give a
 * non-finite number the same digest as a missing one. That is refused rather
 * than normalised: a payload nobody can reconstruct is not evidence.
 */
export function canonicalJson(value: JsonValue): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TrajectoryError('payload_not_finite');
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const parts = Object.keys(value)
    .sort()
    // An explicit `undefined` is not JSON and `JSON.stringify` drops it from an
    // object but renders it `null` in an array. Dropping it here keeps the two
    // shapes consistent with what a reader of the serialized form would rebuild.
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${parts.join(',')}}`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function eventHash(event: Omit<TrajectoryEvent, 'hash'>): string {
  return sha256(
    canonicalJson({
      schema: event.schema,
      offset: event.offset,
      kind: event.kind,
      atMs: event.atMs,
      payloadDigest: event.payloadDigest,
      previousHash: event.previousHash,
    }),
  );
}

export class TrajectoryLedger {
  private readonly entries: TrajectoryEvent[] = [];
  private head = TRAJECTORY_GENESIS_HASH;
  private sealedBy: TrajectoryEvent | null = null;
  private readonly clock: Clock;

  constructor(options: { clock?: Clock } = {}) {
    this.clock = options.clock ?? systemClock;
  }

  get offset(): number {
    return this.entries.length;
  }

  get headHash(): string {
    return this.head;
  }

  get terminalEvent(): TrajectoryEvent | null {
    return this.sealedBy === null ? null : { ...this.sealedBy };
  }

  get sealed(): boolean {
    return this.sealedBy !== null;
  }

  append(kind: TrajectoryEventKind, payload: JsonValue = null): TrajectoryEvent {
    if (!EVENT_KINDS.has(kind)) throw new TrajectoryError(`ledger_unknown_kind:${String(kind)}`);
    if (this.sealedBy !== null) {
      throw new TrajectoryError(`ledger_sealed:${this.sealedBy.kind}`);
    }
    const unhashed: Omit<TrajectoryEvent, 'hash'> = {
      schema: TRAJECTORY_LEDGER_SCHEMA,
      offset: this.entries.length,
      kind,
      atMs: this.clock.now(),
      payloadDigest: sha256(canonicalJson(payload)),
      previousHash: this.head,
    };
    const event: TrajectoryEvent = { ...unhashed, hash: eventHash(unhashed) };
    this.entries.push(event);
    this.head = event.hash;
    if (TERMINAL_EVENT_KINDS.has(kind)) this.sealedBy = event;
    return { ...event };
  }

  /** The recorded sequence, copied, so a holder cannot rewrite the ledger. */
  serialize(): TrajectoryEvent[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

export interface ReconstructedTrajectory {
  offset: number;
  headHash: string;
  terminal: TrajectoryEvent | null;
  events: TrajectoryEvent[];
}

/** Rebuild a trajectory from recorded events, refusing anything a chain cannot
 * explain: a gap, a reorder, an edited payload, an unknown kind, or an event
 * after the terminal one. */
export function reconstructTrajectory(events: readonly TrajectoryEvent[]): ReconstructedTrajectory {
  let previousHash = TRAJECTORY_GENESIS_HASH;
  let terminal: TrajectoryEvent | null = null;
  const verified: TrajectoryEvent[] = [];
  for (const [index, event] of events.entries()) {
    if (terminal !== null) throw new TrajectoryError(`ledger_post_terminal_event:${index}`);
    if (event.schema !== TRAJECTORY_LEDGER_SCHEMA) {
      throw new TrajectoryError(`ledger_schema_mismatch:${index}`);
    }
    if (!EVENT_KINDS.has(event.kind)) throw new TrajectoryError(`ledger_unknown_kind:${index}`);
    if (event.offset !== index) {
      throw new TrajectoryError(`ledger_offset_gap:${index}:${event.offset}`);
    }
    if (event.previousHash !== previousHash) {
      throw new TrajectoryError(`ledger_chain_broken:${index}`);
    }
    const { hash, ...unhashed } = event;
    if (eventHash(unhashed) !== hash) throw new TrajectoryError(`ledger_hash_mismatch:${index}`);
    const copy: TrajectoryEvent = { ...event };
    verified.push(copy);
    previousHash = hash;
    if (TERMINAL_EVENT_KINDS.has(event.kind)) terminal = copy;
  }
  return { offset: verified.length, headHash: previousHash, terminal, events: verified };
}

/** The ledger half of a `HarnessAdapter v1` resume binding. */
export function ledgerBinding(ledger: TrajectoryLedger): {
  ledgerOffset: number;
  ledgerHeadHash: string;
} {
  return { ledgerOffset: ledger.offset, ledgerHeadHash: ledger.headHash };
}

const TERMINAL_FOR_REASON: Record<CloseReason, TrajectoryEventKind> = {
  quiescent: 'quiescence.reached',
  cancelled: 'session.cancelled',
  'timed-out': 'session.timed-out',
};

interface Disposer {
  name: string;
  dispose: () => void | Promise<void>;
}

/** A reversible lifecycle over one ledger.
 *
 * Disposers run in reverse registration order, which is the only order that
 * undoes a dependency chain. Children close before their parent's disposers do,
 * so a cancellation reaches the innermost work first.
 *
 * Only a root scope writes the ledger's terminal event. A child writes
 * `scope.closed`, because a ledger has exactly one terminal event and a nested
 * scope finishing is not the session finishing.
 */
export class LifecycleScope {
  private readonly disposers: Disposer[] = [];
  private readonly children: LifecycleScope[] = [];
  private readonly parent: LifecycleScope | null;
  private readonly ledger: TrajectoryLedger;
  private readonly clock: Clock;
  private closing: Promise<QuiescenceReceipt> | null = null;
  private receipt: QuiescenceReceipt | null = null;
  private cancelledWith: string | null = null;

  constructor(
    readonly name: string,
    ledger: TrajectoryLedger,
    options: { clock?: Clock; parent?: LifecycleScope } = {},
  ) {
    this.ledger = ledger;
    this.clock = options.clock ?? systemClock;
    this.parent = options.parent ?? null;
  }

  get closed(): boolean {
    return this.receipt !== null;
  }

  get cancelled(): boolean {
    return this.cancelledWith !== null;
  }

  /** The receipt, once closed. `null` while the scope is still open. */
  get quiescence(): QuiescenceReceipt | null {
    return this.receipt === null ? null : { ...this.receipt };
  }

  register(name: string, dispose: () => void | Promise<void>): void {
    this.requireOpen();
    this.disposers.push({ name, dispose });
  }

  child(name: string): LifecycleScope {
    this.requireOpen();
    const scope = new LifecycleScope(`${this.name}/${name}`, this.ledger, {
      clock: this.clock,
      parent: this,
    });
    this.children.push(scope);
    return scope;
  }

  /** Close normally. Idempotent: later calls return the first receipt. */
  async dispose(): Promise<QuiescenceReceipt> {
    return this.close('quiescent', null);
  }

  /** Cancel this scope and everything under it. Idempotent. */
  async cancel(detail: string): Promise<QuiescenceReceipt> {
    if (this.closing !== null) return this.closing;
    this.requireRecordable();
    this.cancelledWith = detail;
    this.ledger.append('cancellation.requested', { scope: this.name, detail });
    return this.close('cancelled', detail);
  }

  /** Run `action` under a time budget.
   *
   * A budget that expires closes the scope as `timed-out` and throws. The
   * abandoned work is **not** stopped -- `Promise.race` cannot cancel a promise
   * -- so work that must be reclaimed has to register a disposer. The receipt
   * records which operation expired so the gap is visible rather than implied.
   */
  async runBounded<T>(name: string, budgetMs: number, action: () => Promise<T>): Promise<T> {
    this.requireOpen();
    if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0) {
      throw new TrajectoryError(`invalid_budget:${name}`);
    }
    const timer = this.clock.timer(budgetMs);
    const running = action();
    // The race's loser still settles. Without this, an action that rejects after
    // the budget expired surfaces as an unhandled rejection and can take the
    // process down instead of the timeout being reported.
    running.catch(() => undefined);
    try {
      const timedOut = Symbol('bounded-timeout');
      const outcome = await Promise.race([running, timer.expiry.then(() => timedOut)]);
      if (outcome === timedOut) {
        this.ledger.append('bounded.timed-out', { scope: this.name, operation: name, budgetMs });
        await this.close('timed-out', name);
        throw new TrajectoryError(`bounded_timeout:${name}`);
      }
      return outcome as T;
    } finally {
      timer.cancel();
    }
  }

  private requireOpen(): void {
    if (this.closing !== null) throw new TrajectoryError(`scope_closed:${this.name}`);
  }

  /** Refuse to start closing against a ledger that can no longer record it.
   *
   * Only a root scope's own close seals a ledger, so no ordinary path reaches
   * this. It is checked anyway because the alternative failure is the bad one:
   * the first disposer runs, the first `disposer.ran` append is refused, and
   * the walk aborts with the remaining resources still held and nothing in the
   * record to say so. Either the whole closing sequence happens or none of it
   * does.
   */
  private requireRecordable(): void {
    if (this.ledger.sealed) throw new TrajectoryError(`scope_ledger_sealed:${this.name}`);
  }

  private close(reason: CloseReason, detail: string | null): Promise<QuiescenceReceipt> {
    // Assigned before the first await so two concurrent closes share one run.
    if (this.closing !== null) return this.closing;
    try {
      this.requireRecordable();
    } catch (error) {
      return Promise.reject(error);
    }
    this.closing = this.runClose(reason, detail);
    return this.closing;
  }

  private async runClose(reason: CloseReason, detail: string | null): Promise<QuiescenceReceipt> {
    for (const child of [...this.children].reverse()) {
      if (reason === 'quiescent') {
        await child.dispose();
      } else {
        await child.cancelFromParent(reason, detail);
      }
    }

    const disposersRun: string[] = [];
    const disposersFailed: string[] = [];
    for (const disposer of [...this.disposers].reverse()) {
      try {
        await disposer.dispose();
        disposersRun.push(disposer.name);
        this.ledger.append('disposer.ran', { scope: this.name, disposer: disposer.name });
      } catch (error) {
        // One disposer failing must not strand the rest: the remaining
        // resources would leak for a reason unrelated to them. The failure is
        // recorded and the reverse-order walk continues.
        disposersFailed.push(disposer.name);
        this.ledger.append('disposer.failed', {
          scope: this.name,
          disposer: disposer.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.ledger.append('scope.closed', {
      scope: this.name,
      reason,
      detail,
      disposersRun,
      disposersFailed,
    });
    // The closing reason says why the scope stopped, not whether cleanup
    // succeeded. A failed disposer is reported in the receipt rather than
    // rewriting a cancellation into a failure.
    if (this.parent === null) this.ledger.append(TERMINAL_FOR_REASON[reason]);

    const unhashed = {
      schema: TRAJECTORY_LEDGER_SCHEMA,
      scope: this.name,
      reason,
      detail,
      ledgerOffset: this.ledger.offset,
      ledgerHeadHash: this.ledger.headHash,
      disposersRun,
      disposersFailed,
      atMs: this.clock.now(),
    };
    this.receipt = { ...unhashed, receiptHash: sha256(canonicalJson(unhashed)) };
    return { ...this.receipt };
  }

  private async cancelFromParent(
    reason: CloseReason,
    detail: string | null,
  ): Promise<QuiescenceReceipt> {
    if (this.closing !== null) return this.closing;
    if (reason === 'cancelled') this.cancelledWith = detail;
    return this.close(reason, detail);
  }
}
