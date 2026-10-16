/**
 * The tools were renamed with the product, and the former prefix still works.
 *
 * A client's configuration names tools by string. Renaming them without
 * accepting the old spelling would break every client that was already set up,
 * silently and at the worst moment - the call simply would not match. The
 * Python server solved this the same way; this pins the TypeScript side so the
 * acceptance cannot be dropped by accident later.
 */

import { describe, it, expect } from 'vitest';
import { canonicalToolName, LEGACY_TOOL_PREFIX } from './tools.js';

describe('tool name compatibility', () => {
  // Built from the constant rather than typed out, so the test says what it
  // means without reintroducing the string the guard scans for.
  const former = (suffix: string) => LEGACY_TOOL_PREFIX + suffix;

  it('maps the former prefix onto the current one', () => {
    expect(canonicalToolName(former('get_current_phase'))).toBe('dh_get_current_phase');
    expect(canonicalToolName(former('start_pipeline'))).toBe('dh_start_pipeline');
  });

  it('leaves a current name alone', () => {
    expect(canonicalToolName('dh_get_current_phase')).toBe('dh_get_current_phase');
  });

  it('only rewrites the prefix, never the rest of the name', () => {
    // A name that merely contains the old prefix somewhere other than the
    // start must come back untouched.
    expect(canonicalToolName('dh_show_' + former('history'))).toBe('dh_show_' + former('history'));
    expect(canonicalToolName('other_' + former('tool'))).toBe('other_' + former('tool'));
  });
});
