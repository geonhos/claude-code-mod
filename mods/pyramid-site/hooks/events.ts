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

const CALL = /(?:^|[;&|(]\s*|\s)harness\s+(ask|report)\s+(analyst|implementer|reviewer)\b/
const EXIT = /^Exit code (\d+)/

export function parseHarnessCall(command: string): HarnessCall | undefined {
  const match = CALL.exec(command)
  if (match === null) return undefined
  return { verb: match[1] as HarnessVerb, worker: match[2] as PyramidWorkerName }
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

export function reportTextOf(result: ToolCallResult): string {
  const stdout = recordOf(result)?.stdout
  return typeof stdout === 'string' ? stdout : result.text ?? ''
}

export function interpretResult(call: HarnessCall, result: ToolCallResult): DomainEvent | undefined {
  const { verb, worker } = call
  if (result.deny !== undefined) return verb === 'ask' ? { kind: 'idle', worker } : undefined
  if (isBackgrounded(result)) return undefined
  const code = exitCodeOf(result)
  if (code === undefined) return undefined
  if (code === 0) {
    const text = reportTextOf(result)
    return text.trim() === '' ? { kind: 'idle', worker } : { kind: 'report', worker, text }
  }
  if (verb === 'report') return code === 3 ? { kind: 'idle', worker } : undefined
  if (code === 2) return { kind: 'blocked', worker }
  if (code === 4) return { kind: 'waiting', worker }
  return { kind: 'idle', worker }
}
