import { describe, expect, test } from 'claude-code/testing'

import { parseStatus } from './status'

describe('parseStatus', () => {
  test('maps every harness status line', () => {
    expect(
      parseStatus('analyst      working  w5:p2\nimplementer  done     w5:p3\nreviewer     -\n'),
    ).toEqual({ analyst: 'working', implementer: 'idle', reviewer: 'absent' })
  })
  test('keeps blocked and idle', () => {
    expect(parseStatus('analyst blocked w1:p1\nreviewer idle w1:p2')).toEqual({ analyst: 'blocked', reviewer: 'idle' })
  })
  test('skips unknown states, unknown names and junk', () => {
    expect(parseStatus('analyst unknown w1:p1\nboss working w1:p9\n\nharness: oops\n')).toEqual({})
  })
})
