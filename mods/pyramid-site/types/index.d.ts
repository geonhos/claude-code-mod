export type PyramidWorkerName = 'analyst' | 'implementer' | 'reviewer'

export type PyramidWorkerState = 'idle' | 'working' | 'blocked' | 'waiting'

export type PyramidCompleted = { wonder: string; date: string }

export type PyramidProgress = {
  v: 1
  wonderIndex: number
  bricks: number
  cracked: number[]
  completed: PyramidCompleted[]
  seenReports: string[]
  paneWanted: boolean
}

export type PyramidWorld = {
  progress: PyramidProgress
  workers: Record<PyramidWorkerName, PyramidWorkerState>
  askedAt: Record<PyramidWorkerName, number>
}

declare module 'claude-code' {
  interface PluginState {
    'pyramid-site': { world: PyramidWorld }
  }
}
