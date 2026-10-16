import type { ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { exitCodeOf, interpretResult, parseHarnessCall } from './events'

const ok = (stdout: string): ToolCallResult => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout })
const failed = (code: number, rest = 'harness: x'): ToolCallResult => ({ isError: true, result: `Exit code ${code}\n${rest}`, text: `Exit code ${code}\n${rest}` })
const ASK = { verb: 'ask', worker: 'analyst' } as const
const REPORT = { verb: 'report', worker: 'reviewer' } as const

describe('parseHarnessCall', () => {
  test('finds ask and report for the three workers', () => {
    expect(parseHarnessCall("harness ask analyst 'Read .harness/task-analyst.md and do it.'")).toEqual(ASK)
    expect(parseHarnessCall('harness report reviewer')).toEqual(REPORT)
    expect(parseHarnessCall('cd /repo && harness ask implementer "go"')).toEqual({ verb: 'ask', worker: 'implementer' })
    expect(parseHarnessCall('(harness ask reviewer x)')).toEqual({ verb: 'ask', worker: 'reviewer' })
  })
  test('ignores other verbs, other agents and look-alikes', () => {
    expect(parseHarnessCall('harness status')).toBeUndefined()
    expect(parseHarnessCall('harness spawn analyst')).toBeUndefined()
    expect(parseHarnessCall('harness ask boss now')).toBeUndefined()
    expect(parseHarnessCall('myharness ask analyst x')).toBeUndefined()
    expect(parseHarnessCall('harness ask analysts x')).toBeUndefined()
  })
})

describe('exitCodeOf', () => {
  test('is 0 on success and parsed from the error text otherwise', () => {
    expect(exitCodeOf(ok('# report'))).toBe(0)
    expect(exitCodeOf(failed(3))).toBe(3)
  })
  test('is undefined on a deny or an error without a code', () => {
    expect(exitCodeOf({ deny: 'no' })).toBeUndefined()
    expect(exitCodeOf({ isError: true, result: 'Interrupted', text: 'Interrupted' })).toBeUndefined()
  })
})

describe('interpretResult', () => {
  test('a printed report becomes a report event', () => {
    expect(interpretResult(ASK, ok('# analyst report\nstatus: done\n'))).toEqual({
      kind: 'report', worker: 'analyst', text: '# analyst report\nstatus: done\n',
    })
    expect(interpretResult(REPORT, ok('# reviewer report\n'))).toEqual({ kind: 'report', worker: 'reviewer', text: '# reviewer report\n' })
  })
  test('ask exit codes map to blocked, waiting and idle', () => {
    expect(interpretResult(ASK, failed(2))).toEqual({ kind: 'blocked', worker: 'analyst' })
    expect(interpretResult(ASK, failed(4))).toEqual({ kind: 'waiting', worker: 'analyst' })
    expect(interpretResult(ASK, failed(3))).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(ASK, failed(1))).toEqual({ kind: 'idle', worker: 'analyst' })
  })
  test('report exit 3 is idle; other report failures say nothing', () => {
    expect(interpretResult(REPORT, failed(3))).toEqual({ kind: 'idle', worker: 'reviewer' })
    expect(interpretResult(REPORT, failed(1))).toBeUndefined()
  })
  test('an empty success is idle, a denied ask is idle', () => {
    expect(interpretResult(ASK, ok('  \n'))).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(ASK, { deny: 'no' })).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(REPORT, { deny: 'no' })).toBeUndefined()
  })
  test('a backgrounded ask leaves the worker as it is', () => {
    expect(interpretResult(ASK, { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: '' })).toBeUndefined()
  })
})
