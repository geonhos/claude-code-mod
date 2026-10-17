import type { ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { exitCodeOf, interpretResult, parseHarnessCall, parseHarnessInvocation } from './events'

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

describe('parseHarnessInvocation', () => {
  test('a lone call is the whole command, anything around it is not', () => {
    expect(parseHarnessInvocation('harness ask analyst go')).toEqual({ ...ASK, isWhole: true })
    expect(parseHarnessInvocation("harness ask analyst go 2>&1")).toEqual({ ...ASK, isWhole: true })
    expect(parseHarnessInvocation('harness ask analyst go | tail -n 40')).toEqual({ ...ASK, isWhole: false })
    expect(parseHarnessInvocation('harness ask analyst go || true')).toEqual({ ...ASK, isWhole: false })
    expect(parseHarnessInvocation('cd /repo && harness ask analyst go')).toEqual({ ...ASK, isWhole: false })
    expect(parseHarnessInvocation('harness ask analyst go; echo $?')).toEqual({ ...ASK, isWhole: false })
  })
  test('a trailing & backgrounds the call, so it is not whole', () => {
    expect(parseHarnessInvocation('harness ask analyst go &')).toEqual({ ...ASK, isWhole: false })
    expect(parseHarnessInvocation('harness ask analyst go 2>&1 &')).toEqual({ ...ASK, isWhole: false })
    expect(parseHarnessInvocation('harness ask analyst go && true')).toEqual({ ...ASK, isWhole: false })
    expect(parseHarnessInvocation('harness ask analyst go 2>&1')).toEqual({ ...ASK, isWhole: true })
  })
  test('skips NAME=value words, time and timeout <n> before the program', () => {
    expect(parseHarnessInvocation('FOO=1 BAR=x harness ask analyst go')).toEqual({ ...ASK, isWhole: true })
    expect(parseHarnessInvocation('timeout 700 harness ask analyst go')).toEqual({ ...ASK, isWhole: true })
    expect(parseHarnessInvocation('time harness ask analyst go')).toEqual({ ...ASK, isWhole: true })
    expect(parseHarnessInvocation('FOO=1 timeout 5m /opt/bin/harness report reviewer')).toEqual({ ...REPORT, isWhole: true })
    expect(parseHarnessCall('timeout harness ask analyst go')).toBeUndefined()
    expect(parseHarnessCall('FOO=1 echo harness ask analyst go')).toBeUndefined()
  })
  test('accepts a path prefix', () => {
    expect(parseHarnessCall('/opt/bin/harness ask reviewer x')).toEqual({ verb: 'ask', worker: 'reviewer' })
    expect(parseHarnessCall('~/.local/bin/harness report analyst')).toEqual({ verb: 'report', worker: 'analyst' })
    expect(parseHarnessCall('$HOME/bin/harness ask implementer x')).toEqual({ verb: 'ask', worker: 'implementer' })
  })
  test('never matches text inside quotes or a non-harness program', () => {
    expect(parseHarnessCall('git commit -m "harness ask reviewer"')).toBeUndefined()
    expect(parseHarnessCall("echo 'x; harness ask reviewer'")).toBeUndefined()
    expect(parseHarnessCall('echo harness ask reviewer')).toBeUndefined()
    expect(parseHarnessCall('grep harness ask reviewer file')).toBeUndefined()
  })
})

describe('interpretResult', () => {
  const WHOLE_ASK = { ...ASK, isWhole: true } as const
  const PIPED_ASK = { ...ASK, isWhole: false } as const
  const WHOLE_REPORT = { ...REPORT, isWhole: true } as const
  const FILE = '# analyst report\nstatus: done\n'

  test('a fresh report file becomes a report event, whatever stdout says', () => {
    expect(interpretResult(WHOLE_ASK, ok('screen text'), FILE)).toEqual({ kind: 'report', worker: 'analyst', text: FILE })
    expect(interpretResult(PIPED_ASK, ok('screen text'), FILE)).toEqual({ kind: 'report', worker: 'analyst', text: FILE })
    expect(interpretResult(WHOLE_REPORT, ok('x'), FILE)).toEqual({ kind: 'report', worker: 'reviewer', text: FILE })
  })
  test('stdout lays a brick only for a whole command that exited 0 with no report file', () => {
    expect(interpretResult(PIPED_ASK, ok('# analyst report\nstatus: done\n'), undefined)).toBeUndefined()
    expect(interpretResult(WHOLE_ASK, ok('# analyst report\nstatus: done\n'), undefined)).toEqual({
      kind: 'report', worker: 'analyst', text: '# analyst report\nstatus: done\n',
    })
    expect(interpretResult(WHOLE_ASK, ok('  \n'), undefined)).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(WHOLE_ASK, failed(3, '# screen'), undefined)).toEqual({ kind: 'idle', worker: 'analyst' })
  })
  test('ask exit codes are trusted only for a whole command', () => {
    expect(interpretResult(WHOLE_ASK, failed(2), undefined)).toEqual({ kind: 'blocked', worker: 'analyst' })
    expect(interpretResult(WHOLE_ASK, failed(4), undefined)).toEqual({ kind: 'waiting', worker: 'analyst' })
    expect(interpretResult(WHOLE_ASK, failed(3), undefined)).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(WHOLE_ASK, failed(1), undefined)).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(PIPED_ASK, failed(2), undefined)).toBeUndefined()
    expect(interpretResult(PIPED_ASK, failed(4), undefined)).toBeUndefined()
  })
  test('report exit 3 is idle; other report failures say nothing', () => {
    expect(interpretResult(WHOLE_REPORT, failed(3), undefined)).toEqual({ kind: 'idle', worker: 'reviewer' })
    expect(interpretResult(WHOLE_REPORT, failed(1), undefined)).toBeUndefined()
  })
  test('a denied ask is idle, a denied report says nothing', () => {
    expect(interpretResult(WHOLE_ASK, { deny: 'no' }, undefined)).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(WHOLE_REPORT, { deny: 'no' }, FILE)).toBeUndefined()
  })
  test('a backgrounded ask leaves the worker as it is', () => {
    const background = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: '' }
    expect(interpretResult(WHOLE_ASK, background, FILE)).toBeUndefined()
  })
  test('a blank report file is no report', () => {
    expect(interpretResult(PIPED_ASK, ok(''), '  \n')).toBeUndefined()
  })
})
