"""Hang guards sized for the machine the suite actually runs on.

Several tests spawn the harness — bash, then python, then git, then whatever
the harness itself spawns — and wait a fixed number of seconds for an answer.
Those numbers were measured on an idle box. The full suite is not an idle box:
under it the same work takes several times longer, the test reads an empty
string because nothing has answered yet, and a process that was working fine
is reported as broken.

The suite has already learned this once. `STOP_GATE_TIMEOUT_SECS` was raised
from ten seconds to sixty with a comment saying exactly that, and the machine
has got busier since.

What made it worth fixing properly: two full runs on an unchanged tree produced
*different* sets of failures, and every test involved passed on its own. A gate
whose verdict changes while the tree does not is not a gate — and a gate that
blocks at random is one people learn to work around, which costs more than the
bug it was meant to catch.

So these bounds are hang guards again rather than assertions about speed. They
are generous enough that load cannot trip them and still fail something that
has genuinely stopped. One environment variable moves all of them, so a slower
host says so once instead of editing tests.
"""

from __future__ import annotations

import os

#: Multiplies every spawn bound. Four is not a measurement — it is headroom
#: chosen so that load cannot plausibly reach it, because waiting longer for a
#: hung process costs a few seconds once and a false failure costs a commit.
DEFAULT_SCALE = 4.0
ENV_VAR = "DAIHARNESS_TEST_TIMEOUT_SCALE"


def spawn_timeout(idle_seconds: float) -> float:
    """Scale a bound that was measured on an idle machine.

    `idle_seconds` is what the work takes with nothing else running. The result
    is what to wait before concluding the process will never answer.
    """

    raw = os.environ.get(ENV_VAR)
    if raw is None:
        scale = DEFAULT_SCALE
    else:
        try:
            scale = float(raw)
        except ValueError:
            # A malformed value must not quietly tighten a hang guard, which
            # would reintroduce the flake this module exists to remove.
            scale = DEFAULT_SCALE
    if scale < 1.0:
        scale = 1.0
    return idle_seconds * scale
