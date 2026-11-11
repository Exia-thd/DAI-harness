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

## What this basis cannot cover

`artifact_pins`, `project_storage`, `project_recipe` and
`resource_controls._bounded_file` anchor on the **workspace**, not on a private
home — `artifact_lock(workspace)` is the shape of all of them. A project
legitimately lives outside the user profile, so containment is not an available
basis there and requiring it would refuse ordinary layouts. Their owner and
mode guards therefore remain vacuous on Windows. That is a real remaining gap,
not a solved one, and closing it needs an actual ACL read
(`GetNamedSecurityInfo` through ctypes) rather than a path test. It is tracked
separately rather than papered over.

Noted while surveying, and a different defect: `scripts/runtime/runtime_registry.py`
resolves an RLG home from `DAIHARNESS_RLG_HOME` and writes `leases.jsonl` into
it with **no** ownership or mode guard on any platform. That is an absent check
rather than a vacuous one, so it is not fixed here.
