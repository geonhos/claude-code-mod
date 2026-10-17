import type { ToolCallResult } from 'claude-code'

import type { PyramidWorkerName } from '../types'
import type { Polled } from './status'

export type HarnessVerb = 'ask' | 'report'
export type HarnessCall = { verb: HarnessVerb; worker: PyramidWorkerName }

export type DomainEvent =
  | { kind: 'ask'; worker: PyramidWorkerName }
  | { kind: 'report'; worker: PyramidWorkerName; text: string }
  | { kind: 'blocked'; worker: PyramidWorkerName }
  | { kind: 'waiting'; worker: PyramidWorkerName }
  | { kind: 'idle'; worker: PyramidWorkerName }
  | { kind: 'caravan' }
  | { kind: 'status'; polled: Polled }

const HARNESS_WORD = /^(?:\S*\/)?harness$/
const WORKERS = ['analyst', 'implementer', 'reviewer']
const EXIT = /^Exit code (\d+)/

export type HarnessInvocation = HarnessCall & { isWhole: boolean }

// Splits a command line at unquoted `;`, `&&`, `||`, `|`, `&`, `(`, `)` and newlines. Quoted text never splits, so a
// mention of harness inside a string stays inside its segment. `2>&1` and `&>` are redirections, not separators.
function segmentsOf(command: string): { segments: string[]; isBackground: boolean } {
  const segments: string[] = []
  let current = ''
  let lastSeparator: string | undefined
  let quote: '"' | "'" | undefined
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!
    if (quote !== undefined) {
      current += ch
      if (ch === '\\' && quote === '"') {
        i += 1
        current += command[i] ?? ''
      } else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '\\') {
      current += ch + (command[i + 1] ?? '')
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    const isRedirect = ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')
    if (!isRedirect && (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')' || ch === '\n')) {
      segments.push(current)
      current = ''
      lastSeparator = ch === '&' && command[i - 1] !== '&' && command[i + 1] !== '&' ? '&' : ch
      continue
    }
    if (!/\s/.test(ch)) lastSeparator = undefined
    current += ch
  }
  segments.push(current)
  return { segments: segments.map(segment => segment.trim()).filter(segment => segment !== ''), isBackground: lastSeparator === '&' }
}

const ENV_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/
const DURATION = /^\d+(?:\.\d+)?[smhd]?$/

// Drops what runs before the program: `NAME=value` words, `time`, and `timeout <duration>`.
function commandWords(segment: string): string[] {
  const words = segment.split(/\s+/)
  let at = 0
  for (;;) {
    const word = words[at]
    if (word !== undefined && ENV_WORD.test(word)) at += 1
    else if (word === 'time') at += 1
    else if (word === 'timeout' && DURATION.test(words[at + 1] ?? '')) at += 2
    else break
  }
  return words.slice(at)
}

export function parseHarnessInvocation(command: string): HarnessInvocation | undefined {
  const { segments, isBackground } = segmentsOf(command)
  for (const segment of segments) {
    const [program, verb, worker] = commandWords(segment)
    if (program === undefined || verb === undefined || worker === undefined) continue
    if (!HARNESS_WORD.test(program) || (verb !== 'ask' && verb !== 'report') || !WORKERS.includes(worker)) continue
    return { verb, worker: worker as PyramidWorkerName, isWhole: segments.length === 1 && !isBackground }
  }
  return undefined
}

export function parseHarnessCall(command: string): HarnessCall | undefined {
  const found = parseHarnessInvocation(command)
  return found === undefined ? undefined : { verb: found.verb, worker: found.worker }
}

export function exitCodeOf(result: ToolCallResult): number | undefined {
  if (result.deny !== undefined) return undefined
  if (result.isError === true) {
    const match = EXIT.exec(result.text ?? '')
    return match === null ? undefined : Number(match[1])
  }
  return 0
}

const recordOf = (result: ToolCallResult): Record<string, unknown> | undefined =>
  typeof result.result === 'object' && result.result !== null ? (result.result as Record<string, unknown>) : undefined

export function isBackgrounded(result: ToolCallResult): boolean {
  return typeof recordOf(result)?.backgroundTaskId === 'string'
}

const stdoutOf = (result: ToolCallResult): string => {
  const stdout = recordOf(result)?.stdout
  return typeof stdout === 'string' ? stdout : ''
}

export function reportPathOf(worker: PyramidWorkerName): string {
  return `.harness/reports/${worker}.md`
}

// `reportText` is the worker's report file, read after the call. stdout and the exit code belong to the whole command
// line, so they only count when the harness call is the entire command.
export function interpretResult(call: HarnessInvocation, result: ToolCallResult, reportText: string | undefined): DomainEvent | undefined {
  const { verb, worker, isWhole } = call
  if (result.deny !== undefined) return verb === 'ask' ? { kind: 'idle', worker } : undefined
  if (isBackgrounded(result)) return undefined
  const code = exitCodeOf(result)
  if (isWhole && verb === 'ask' && code === 2) return { kind: 'blocked', worker }
  if (isWhole && verb === 'ask' && code === 4) return { kind: 'waiting', worker }
  if (reportText !== undefined && reportText.trim() !== '') return { kind: 'report', worker, text: reportText }
  if (!isWhole || code === undefined) return undefined
  // The hook's cwd may differ from the shell's after a `cd`, so a missing file falls back to what harness printed.
  if (code === 0) {
    const printed = stdoutOf(result)
    if (printed.trim() !== '') return { kind: 'report', worker, text: printed }
  }
  if (verb === 'report') return code === 3 ? { kind: 'idle', worker } : undefined
  return { kind: 'idle', worker }
}
