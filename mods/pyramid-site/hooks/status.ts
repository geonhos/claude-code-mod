import type { PyramidWorkerName } from '../types'
import { WORKER_NAMES } from './sprites'

export type PolledState = 'idle' | 'working' | 'blocked' | 'absent'
export type Polled = Partial<Record<PyramidWorkerName, PolledState>>

const isWorker = (name: string): name is PyramidWorkerName => (WORKER_NAMES as readonly string[]).includes(name)

const STATES: Readonly<Record<string, PolledState>> = {
  '-': 'absent',
  idle: 'idle',
  done: 'idle',
  working: 'working',
  blocked: 'blocked',
}

export function parseStatus(stdout: string): Polled {
  const polled: Polled = {}
  for (const line of stdout.split('\n')) {
    const [name, state] = line.trim().split(/\s+/)
    if (name === undefined || state === undefined || !isWorker(name)) continue
    const mapped = STATES[state]
    if (mapped !== undefined) polled[name] = mapped
  }
  return polled
}
