import { describe, expect, test } from 'claude-code/testing'

import { countFindings, findingLines, reportId, reportStatus } from './reports'

const REVIEW = [
  '# reviewer report — main...HEAD, 3 files',
  'status: done',
  '## Findings / Decisions',
  '- **READY TO PUSH: not yet.**',
  '- [Critical] a.ts:1 — breaks',
  '- [Important] b.ts:2 — not in the contract but real reports use it',
  '  - [Minor] nested bullets count too',
  '- [Minor] c.ts:3 — nit',
  '## Verification',
  '- [Major] this is not in the Findings section',
  '## Open questions',
  '- none',
].join('\n')

describe('findingLines', () => {
  test('returns the lines between ## Findings and the next ## heading', () => {
    expect(findingLines(REVIEW)).toHaveLength(5)
  })
  test('is empty without a Findings section', () => {
    expect(findingLines('# x\nstatus: done\n')).toEqual([])
  })
})

describe('countFindings', () => {
  test('counts severity-tagged bullets in the Findings section only', () => {
    expect(countFindings(REVIEW)).toBe(4)
  })
  test('is zero for a clean review', () => {
    expect(countFindings('status: done\n## Findings / Decisions\n- no findings\n## Verification\n')).toBe(0)
  })
  test('ignores case of the tag', () => {
    expect(countFindings('## Findings\n- [minor] x\n')).toBe(1)
  })
})

describe('reportStatus', () => {
  test('reads the status line', () => {
    expect(reportStatus(REVIEW)).toBe('done')
    expect(reportStatus('# r\nstatus: blocked\n')).toBe('blocked')
    expect(reportStatus('# r\nStatus: Partial\n')).toBe('partial')
  })
  test('is undefined without one', () => {
    expect(reportStatus('# r\n')).toBeUndefined()
  })
})

describe('reportId', () => {
  test('is stable and ignores surrounding whitespace', () => {
    expect(reportId(REVIEW)).toBe(reportId(`\n${REVIEW}\n\n`))
    expect(reportId(REVIEW)).toMatch(/^[0-9a-f]{8}-\d+$/)
  })
  test('differs for different reports', () => {
    expect(reportId('a')).not.toBe(reportId('b'))
  })
})
