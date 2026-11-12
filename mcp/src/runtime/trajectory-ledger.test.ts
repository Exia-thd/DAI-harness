/** H2 exit evidence: deterministic reconstruction, disposer idempotency,
 * cancellation, timeout, and no event after the terminal event.
 *
 * The clock is injected everywhere so none of these depend on real time. A
 * timeout test that waits for a real timer is a slow test that also proves
 * less: it cannot show that the ledger's hashes come only from recorded
 * content.
 */

import { describe, expect, it } from 'vitest';

import {
  LifecycleScope,
  TRAJECTORY_GENESIS_HASH,
  TRAJECTORY_LEDGER_SCHEMA,
  TrajectoryError,
  TrajectoryLedger,
  canonicalJson,
  ledgerBinding,
  reconstructTrajectory,
  type Clock,
  type TrajectoryEvent,
  type TrajectoryEventKind,
} from './trajectory-ledger.js';

/** A clock with no wall-clock dependency: `now` advances by a fixed step and a
 * timer expires only when the test says so. */
class TestClock implements Clock {
  private current: number;
  private pending: Array<() => void> = [];

  constructor(
    start = 1_700_000_000_000,
    private readonly step = 1,
  ) {
    this.current = start;
  }

  now(): number {
    this.current += this.step;
    return this.current;
  }

  timer(_milliseconds: number): { expiry: Promise<void>; cancel(): void } {
    let fire: () => void = () => undefined;
    const expiry = new Promise<void>((resolveExpiry) => {
      fire = resolveExpiry;
    });
    this.pending.push(fire);
    return { expiry, cancel: () => undefined };
  }

  expire(): void {
    for (const fire of this.pending.splice(0)) fire();
  }
}

function scriptedLedger(clock: Clock): TrajectoryLedger {
  const ledger = new TrajectoryLedger({ clock });
  ledger.append('session.started', { workspaceId: 'workspace-a', sessionId: 'session-1' });
  ledger.append('turn.started', { turnId: 'turn-1' });
  ledger.append('model.call', { route: 'worker', promptTokens: 120 });
  ledger.append('tool.call', { tool: 'read_file', path: 'docs/architecture.md' });
  ledger.append('approval.decided', { decision: 'allow' });
  ledger.append('checkpoint.written', { checkpointHash: 'a'.repeat(64) });
  return ledger;
}

describe('TrajectoryLedger reconstruction', () => {
  it('rebuilds the identical offset and head hash from the recorded events', () => {
    const ledger = scriptedLedger(new TestClock());
    const recorded = ledger.serialize();

    const rebuilt = reconstructTrajectory(recorded);

    expect(rebuilt.offset).toBe(ledger.offset);
    expect(rebuilt.headHash).toBe(ledger.headHash);
    expect(rebuilt.terminal).toBeNull();
    expect(recorded[0]?.previousHash).toBe(TRAJECTORY_GENESIS_HASH);
    expect(recorded.map((event) => event.offset)).toEqual([0, 1, 2, 3, 4, 5]);
    // Replaying twice must not drift: reconstruction reads the record only.
    expect(reconstructTrajectory(recorded).headHash).toBe(rebuilt.headHash);
  });

  it('derives the head from recorded content alone, not from the clock it ran on', () => {
    const first = scriptedLedger(new TestClock());
    const second = scriptedLedger(new TestClock());

    expect(second.headHash).toBe(first.headHash);
    expect(scriptedLedger(new TestClock(9_000_000_000_000)).headHash).not.toBe(first.headHash);
  });

  it('refuses a reordered, edited, or truncated sequence instead of rebuilding it', () => {
    const recorded = scriptedLedger(new TestClock()).serialize();

    const reordered = [...recorded];
    const third = reordered[2] as TrajectoryEvent;
    const fourth = reordered[3] as TrajectoryEvent;
    reordered[2] = fourth;
    reordered[3] = third;
    expect(() => reconstructTrajectory(reordered)).toThrowError('ledger_offset_gap:2:3');

    const edited = recorded.map((event) => ({ ...event }));
    const target = edited[2] as TrajectoryEvent;
    target.payloadDigest = 'f'.repeat(64);
    expect(() => reconstructTrajectory(edited)).toThrowError('ledger_hash_mismatch:2');

    expect(() => reconstructTrajectory(recorded.slice(1))).toThrowError('ledger_offset_gap:0:1');

    const foreign = recorded.map((event) => ({ ...event }));
    (foreign[0] as unknown as { schema: string }).schema = 'other/v1';
    expect(() => reconstructTrajectory(foreign)).toThrowError('ledger_schema_mismatch:0');
  });

  it('exposes the ledger half of a HarnessAdapter v1 resume binding', () => {
    const ledger = scriptedLedger(new TestClock());

    expect(ledgerBinding(ledger)).toEqual({
      ledgerOffset: ledger.offset,
      ledgerHeadHash: ledger.headHash,
    });
  });
});

describe('TrajectoryLedger terminal events', () => {
  it('refuses any append after the terminal event', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });
    ledger.append('session.started', { sessionId: 'session-1' });

    await scope.dispose();

    expect(ledger.sealed).toBe(true);
    expect(ledger.terminalEvent?.kind).toBe('quiescence.reached');
    expect(() => ledger.append('tool.call', { tool: 'read_file' })).toThrowError(
      'ledger_sealed:quiescence.reached',
    );
    const recorded = ledger.serialize();
    expect(recorded.filter((event) => event.kind === 'quiescence.reached')).toHaveLength(1);
    expect(recorded[recorded.length - 1]?.kind).toBe('quiescence.reached');
  });

  it('refuses to rebuild a sequence carrying an event after the terminal event', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });
    ledger.append('session.started', { sessionId: 'session-1' });
    await scope.dispose();

    const recorded = ledger.serialize();
    const head = recorded[recorded.length - 1] as TrajectoryEvent;
    const forged: TrajectoryEvent = {
      ...head,
      kind: 'tool.call',
      offset: recorded.length,
      previousHash: head.hash,
    };

    expect(() => reconstructTrajectory([...recorded, forged])).toThrowError(
      `ledger_post_terminal_event:${recorded.length}`,
    );
  });

  it('rejects an unknown event kind rather than recording an uninterpretable one', () => {
    const ledger = new TrajectoryLedger({ clock: new TestClock() });

    expect(() => ledger.append('session.restarted' as unknown as TrajectoryEventKind)).toThrowError(
      'ledger_unknown_kind:session.restarted',
    );
  });
});

describe('LifecycleScope disposers', () => {
  it('closes once: a second close runs no disposer again and returns the first receipt', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });
    const calls: string[] = [];
    scope.register('socket', () => {
      calls.push('socket');
    });
    scope.register('tempdir', async () => {
      calls.push('tempdir');
    });

    const first = await scope.dispose();
    const offsetAfterClose = ledger.offset;
    const second = await scope.dispose();
    const third = await scope.cancel('too late');

    expect(calls).toEqual(['tempdir', 'socket']);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(second.receiptHash).toBe(first.receiptHash);
    expect(ledger.offset).toBe(offsetAfterClose);
    expect(scope.cancelled).toBe(false);
    expect(first.reason).toBe('quiescent');
    expect(first.disposersRun).toEqual(['tempdir', 'socket']);
    expect(first.ledgerHeadHash).toBe(ledger.headHash);
    expect(first.schema).toBe(TRAJECTORY_LEDGER_SCHEMA);
  });

  it('keeps releasing the remaining resources when one disposer throws', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });
    const calls: string[] = [];
    scope.register('outer', () => {
      calls.push('outer');
    });
    scope.register('broken', () => {
      throw new Error('handle already gone');
    });
    scope.register('inner', () => {
      calls.push('inner');
    });

    const receipt = await scope.dispose();

    expect(calls).toEqual(['inner', 'outer']);
    expect(receipt.disposersFailed).toEqual(['broken']);
    expect(receipt.disposersRun).toEqual(['inner', 'outer']);
    // Cleanup failing is reported, not promoted into the closing reason.
    expect(receipt.reason).toBe('quiescent');
    expect(ledger.terminalEvent?.kind).toBe('quiescence.reached');
    const failures = ledger.serialize().filter((event) => event.kind === 'disposer.failed');
    expect(failures).toHaveLength(1);
  });

  it('refuses to start closing against a sealed ledger rather than half-releasing', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const owner = new LifecycleScope('session', ledger, { clock });
    await owner.dispose();

    // A second root over the same sealed ledger: closing it could not be
    // recorded, so no disposer may run at all.
    const stray = new LifecycleScope('stray', ledger, { clock });
    let touched = false;
    stray.register('socket', () => {
      touched = true;
    });

    await expect(stray.dispose()).rejects.toThrowError('scope_ledger_sealed:stray');
    await expect(stray.cancel('interrupt')).rejects.toThrowError('scope_ledger_sealed:stray');
    expect(touched).toBe(false);
    expect(stray.closed).toBe(false);
  });

  it('refuses to register new work on a closed scope', async () => {
    const clock = new TestClock();
    const scope = new LifecycleScope('session', new TrajectoryLedger({ clock }), { clock });
    await scope.dispose();

    expect(() =>
      scope.register('late', () => {
        throw new Error('never runs');
      }),
    ).toThrowError('scope_closed:session');
    expect(() => scope.child('late')).toThrowError('scope_closed:session');
  });
});

describe('LifecycleScope cancellation', () => {
  it('propagates to the innermost scope first and seals the ledger exactly once', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const root = new LifecycleScope('session', ledger, { clock });
    const order: string[] = [];
    const worker = root.child('worker');
    const nested = worker.child('nested');
    root.register('root-socket', () => {
      order.push('root-socket');
    });
    worker.register('worker-handle', () => {
      order.push('worker-handle');
    });
    nested.register('nested-temp', () => {
      order.push('nested-temp');
    });

    const receipt = await root.cancel('user-interrupt');

    expect(order).toEqual(['nested-temp', 'worker-handle', 'root-socket']);
    expect(receipt.reason).toBe('cancelled');
    expect(receipt.detail).toBe('user-interrupt');
    expect(root.cancelled).toBe(true);
    expect(worker.cancelled).toBe(true);
    expect(nested.cancelled).toBe(true);
    expect(worker.quiescence?.reason).toBe('cancelled');
    expect(nested.closed).toBe(true);

    const recorded = ledger.serialize();
    expect(recorded.filter((event) => event.kind === 'cancellation.requested')).toHaveLength(1);
    // A nested scope closing is not the session finishing, so only the root
    // writes a terminal event and the ledger keeps exactly one.
    expect(recorded.filter((event) => event.kind === 'session.cancelled')).toHaveLength(1);
    expect(recorded.filter((event) => event.kind === 'scope.closed')).toHaveLength(3);
    expect(recorded[recorded.length - 1]?.kind).toBe('session.cancelled');
    expect(reconstructTrajectory(recorded).terminal?.kind).toBe('session.cancelled');
  });

  it('runs one cancellation when two arrive at once', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });
    let disposed = 0;
    scope.register('socket', () => {
      disposed += 1;
    });

    const [first, second] = await Promise.all([
      scope.cancel('interrupt-a'),
      scope.cancel('interrupt-b'),
    ]);

    expect(disposed).toBe(1);
    expect(second).toEqual(first);
    expect(first.detail).toBe('interrupt-a');
    expect(ledger.serialize().filter((event) => event.kind === 'session.cancelled')).toHaveLength(
      1,
    );
  });
});

describe('LifecycleScope bounded work', () => {
  it('closes the scope as timed out when the budget expires', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });
    let reclaimed = false;
    scope.register('temp-workspace', () => {
      reclaimed = true;
    });

    const pending = scope.runBounded(
      'model.call',
      5_000,
      () => new Promise<string>(() => undefined),
    );
    clock.expire();

    await expect(pending).rejects.toThrowError('bounded_timeout:model.call');
    expect(reclaimed).toBe(true);
    expect(scope.closed).toBe(true);
    expect(scope.quiescence?.reason).toBe('timed-out');
    expect(scope.quiescence?.detail).toBe('model.call');
    expect(ledger.terminalEvent?.kind).toBe('session.timed-out');
    const recorded = ledger.serialize();
    expect(recorded.filter((event) => event.kind === 'bounded.timed-out')).toHaveLength(1);
    expect(recorded[recorded.length - 1]?.kind).toBe('session.timed-out');
    expect(() => ledger.append('tool.call')).toThrowError('ledger_sealed:session.timed-out');
  });

  it('returns the value and leaves the scope open when the work finishes in budget', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });

    await expect(scope.runBounded('tool.call', 5_000, async () => 'ok')).resolves.toBe('ok');

    expect(scope.closed).toBe(false);
    expect(ledger.sealed).toBe(false);
  });

  it('propagates a failing action without closing the scope or sealing the ledger', async () => {
    const clock = new TestClock();
    const ledger = new TrajectoryLedger({ clock });
    const scope = new LifecycleScope('session', ledger, { clock });

    await expect(
      scope.runBounded('tool.call', 5_000, async () => {
        throw new Error('tool refused');
      }),
    ).rejects.toThrowError('tool refused');

    // A failed call is not a terminal lifecycle state: the caller decides.
    expect(scope.closed).toBe(false);
    expect(ledger.sealed).toBe(false);
  });

  it('bounds work with the default clock, which uses a real cancellable timer', async () => {
    const ledger = new TrajectoryLedger();
    const scope = new LifecycleScope('session', ledger);

    // 1ms against a promise that never settles: the only way out is the timer.
    await expect(
      scope.runBounded('model.call', 1, () => new Promise<string>(() => undefined)),
    ).rejects.toThrowError('bounded_timeout:model.call');
    expect(ledger.terminalEvent?.kind).toBe('session.timed-out');

    // A call that finishes in budget must leave no timer holding the loop open.
    const quick = new LifecycleScope('quick', new TrajectoryLedger());
    await expect(quick.runBounded('tool.call', 60_000, async () => 'ok')).resolves.toBe('ok');
  });

  it('refuses a budget that cannot bound anything', async () => {
    const clock = new TestClock();
    const scope = new LifecycleScope('session', new TrajectoryLedger({ clock }), { clock });

    await expect(scope.runBounded('tool.call', 0, async () => 'ok')).rejects.toThrowError(
      'invalid_budget:tool.call',
    );
  });
});

describe('canonicalJson', () => {
  it('digests a value, not the order its keys were written in', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(
      canonicalJson({ a: [2, { c: 3, d: 4 }], b: 1 }),
    );
    expect(canonicalJson({ a: 1, b: null })).toBe('{"a":1,"b":null}');
  });

  it('refuses a non-finite number instead of silently recording it as null', () => {
    expect(() => canonicalJson(Number.NaN)).toThrowError(new TrajectoryError('payload_not_finite'));
    expect(() => canonicalJson({ budget: Number.POSITIVE_INFINITY })).toThrowError(
      'payload_not_finite',
    );
  });
});
