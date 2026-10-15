import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { KaomojiWorker } from '../types'
import { buildRow, isActive, parseStatus } from './faces'

const POLL_MS = 2500
const FRAME_MS = 250
const RUN_TIMEOUT_MS = 2000

const workers = atom({ plugin: 'kaomoji-status', key: 'workers' } as const, [] as KaomojiWorker[])
const frame = atom({ plugin: 'kaomoji-status', key: 'frame' } as const, 0)

export const register: Register = (on, options) => {
  const configured = typeof options.harnessPath === 'string' ? options.harnessPath.trim() : ''
  const harness = configured === '' ? 'harness' : configured
  let isPolling = false
  let ticker: Timer | undefined

  on('session.start', async ($, e, next) => {
    const poll = async (): Promise<void> => {
      if (isPolling) return
      isPolling = true
      try {
        let list: KaomojiWorker[] = []
        try {
          const ran = await $.process.run([harness, 'status'], { timeoutMs: RUN_TIMEOUT_MS })
          list = ran.exitCode === 0 ? parseStatus(ran.stdout) : []
        } catch {
          list = []
        }
        await update($, workers, () => list)
        if (isActive(list)) {
          ticker ??= $.clock.every(FRAME_MS, () => {
            void update($, frame, n => n + 1).catch(() => {})
          })
        } else {
          ticker?.cancel()
          ticker = undefined
        }
      } catch {
        // poll never rejects: a failed state write just waits for the next tick
      } finally {
        isPolling = false
      }
    }

    void poll()
    $.clock.every(POLL_MS, () => {
      void poll()
    })

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, workers)
    if (list.length === 0) return next(e)
    const segments = buildRow(list, await read($, frame), e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="kaomoji-status">
        <Text wrap="truncate-end">
          {segments.map(segment =>
            segment.color === undefined ? (
              segment.text
            ) : (
              <Text color={segment.color} bold={segment.bold === true}>
                {segment.text}
              </Text>
            ),
          )}
        </Text>
      </Box>
    )
  })
}
