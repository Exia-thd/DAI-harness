# ADR-014: On Windows, Containment In The User Profile Is The Private-State Basis

**Status:** Accepted
**Date:** 2026-11-11

## Context

The host-resource runtime protects its private state with a pair of POSIX
checks, applied together at about twenty call sites across nine modules:

```python
if not owner_is_current_user(info) or not private_mode_is_safe(info, 0o077):
    raise ...
```

Both helpers in `scripts/runtime/posix_compat.py` return `True`
unconditionally when `os.getuid` is absent. There is no `st_uid` to compare on
Windows, and there are no permission bits to mask. Measured on a Windows 11
host: a directory created with mode `0o700` reports `0o777`, and a file created
`0o600` reports `0o666`. A mask test would therefore refuse *everything*, which
is exactly why the helper reports success instead.

The consequence is not a weaker check but no check. `write_journal` in
`scripts/runtime/host_job_runner.py` could not raise `unsafe-journal` for any
input on Windows, and the storage census could not raise
`unsafe-storage-journal`. Meanwhile the admission home is redirectable through
`--home` and the `DAIHARNESS_ADMISSION_HOME` environment variable with no
containment check of any kind.

`posix_compat`'s own module docstring already named what protects such a path
on Windows: "that protection comes from the file living in the user's own
profile with default ACLs, and it is weaker than the POSIX check." The
assumption was written down from the start. It was never tested.

## Decision

On Windows, a private state root must be inside the user profile, and a root
that is not is refused. `private_root_is_verifiable` checks exactly that, using
the idiom already present in `scripts/parallel-dispatch-runner.py`:
`is_relative_to(Path.home().resolve(strict=True))`, strict on the profile
because an unresolvable home is not a basis for trust.

On POSIX the function reports `True` and changes nothing. The permission bits
are real there, `private_mode_is_safe` can refuse, and it refuses a
world-readable directory wherever that directory sits. Containment is
deliberately *not* applied on POSIX: the test suite's own fixtures live under
`/tmp`, outside the profile, and are private by mode. Each platform uses the
strongest check it actually has.

## Consequences

An inherited ACL is weaker than owner-plus-mode and this decision does not
claim otherwise. No ACL is read, so an ACL widened after the directory was
created is not detected. What changes is that the guard can now refuse
something instead of nothing.

The journal is deliberately unchanged in content. `resource_controls` digests
the journal bytes and re-verifies that digest on re-read, so recording the
platform basis inside the record would alter a digest-covered cross-module
artifact to state what this document states.

## Where it is applied

The check sits at the four points that *establish* a private root, not at the
twenty that read one. The rest of those twenty guard an already-open anchored
descriptor — `secure_paths.stat_at(descriptor)`, `open_at(parent, name)` — code
written fd-first on purpose to close TOCTOU windows, and several have no stable
path to test. Verifying the root once is both smaller and better placed: every
file beneath a contained directory inherits the profile ACL.

| Establisher | Covers |
|---|---|
| `host_job_runner.write_journal` | the job journal |
| `host_job_runner.storage_journals` | the read-side journal census |
| `host_job_profiles.private_dir` | every call site passes a path derived from the admission home: `host_job_history`, `native_job_requests`, `resource_enrollment`, and the profile store |
| `host_admission_store.AdmissionStore.__init__` | the admission database, and `admission.home`, from which the journal and job directories are built |

`recurrence` needs nothing: it hardcodes `~/.daiharness/runtime/admission` and
ignores the environment override, so it is contained by construction.

## Workspace-rooted storage: measured, and not a defect

This section previously recorded the opposite, and was wrong.

`artifact_pins`, `project_storage`, `project_recipe` and
`resource_controls._bounded_file` anchor on the **workspace**, not on a private
home — `artifact_lock(workspace)` is the shape of all of them. Containment is
not an available basis there, because a project legitimately lives outside the
profile, and the exposure looked serious: this machine's system drive grants
`Users:(OI)(CI)(RX)` and `Authenticated Users:(OI)(CI)(IO)(M)`, both
inheritable, so an existing `C:\Project` directory here carries them and job
storage created under it would be readable by every local user and modifiable
by any authenticated user.

Before writing an ACL layer for it, the premise was measured. Under a workspace
deliberately granting the local Users group inheritable read, listing every
principal other than us, SYSTEM and Administrators:

| Created as | Other principals with access |
|---|---|
| the workspace itself | `S-1-5-32-545` |
| directory, no mode | `S-1-5-32-545` — inherits it |
| **directory, `mode=0o700`** | **none** — the mode *is* translated |
| directory, `mode=0o755` | `S-1-5-32-545` |
| **file, `mode=0o600`** | **`S-1-5-32-545`** — the mode is *not* translated |
| file inside the `0o700` directory | none — inherits the restriction |

CPython translates a directory's POSIX mode into a restrictive DACL on Windows.
`secure_paths.mkdir_at` passes `mode=0o700` by default, so every directory the
runtime creates is already private — by the same mechanism POSIX uses, not a
different one. `artifact_pins` is safe for that reason and not by accident: its
lock lives in a `.daiharness/runtime` that `mkdir_at` created, never directly
in the workspace.

So this project writes no ACLs. Doing so would duplicate what the platform
already did, and keeping an unused primitive whose purpose is to open or close
permissions would be a liability. `windows_acl.py` is therefore a **reader**
only, and `tests/unit_tests/test_windows_acl_job_storage.py` is the tripwire:
the behaviour relied on is a platform detail, not a documented guarantee, and
if a future CPython stops translating the mode then job storage silently
becomes world-readable while every guard above it keeps reporting success.

One rule falls out of the table and is worth keeping: **a file's own mode buys
nothing on Windows.** Privacy comes from its directory, so code that needs a
private file must create the directory holding it rather than trust the open
mode. A test pins that too, so the day it stops being true is visible.

## The RLG lease log

Found while surveying, and a different defect: `runtime_registry` resolved an
RLG home from `DAIHARNESS_RLG_HOME` and wrote `leases.jsonl` into it with **no**
ownership or mode guard on any platform — an absent check rather than a vacuous
one. `mkdir(parents=True, exist_ok=True)` carried no mode, so the directory took
the umask; the log was opened with `open(path, "a")`, so it took 0o666 before
umask; and neither side used `O_NOFOLLOW`, so a redirect left in place of the
log carried the append elsewhere. ADR-010 calls that file the audit trail of
everything the guard ever opened: project paths, session ids, pids, command
lines.

`private_registry_home()` now establishes it with the same basis, and
`append_event` / `read_events` open the log with `O_NOFOLLOW` and verify the
descriptor. Two choices are worth recording:

A directory or log that this user owns but left too open was created before the
guard existed, so it is **tightened rather than refused**. Refusing would break
every installation that already has one, and repairing what we own is not a
bypass. A directory owned by anyone else is still refused, because that is not
ours to repair.

`rlg_home()` stays a pure path builder. `project_disk` and `project_storage`
call it to locate `projects.index` and `budget.yaml`, so making it raise would
change their contract; the guard belongs in the functions that create and read
the log.
