export type KaomojiWorker = { name: string; state: string }

declare module 'claude-code' {
  interface PluginState {
    'kaomoji-status': { workers: KaomojiWorker[]; frame: number }
  }
}
