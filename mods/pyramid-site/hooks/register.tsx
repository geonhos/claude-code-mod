import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import { fitView, toCells } from './cells'
import type { PixelMode, View } from './cells'
import { interpretResult, parseHarnessCall } from './events'
import type { DomainEvent } from './events'
import { formatGallery, statusSegments } from './gallery'
import { drawScene } from './scene'
import type { Anim } from './scene'
import { applyCue, initialAnim, isAnimating, step } from './sim'
import { parseStatus } from './status'
import { PROGRESS_KEY, freshProgress, parseProgress } from './store'
import { apply, initialWorld } from './world'
import type { Cue } from './world'

export const PANE = 'pyramid'
export const PANE_TITLE = 'Pyramid Site'
export const RASTER_KEY = 'scene'
export const FRAME_MS = 83
export const IDLE_MS = 500
export const POLL_MS = 2500
const RUN_TIMEOUT_MS = 2000

const world = atom({ plugin: 'pyramid-site', key: 'world' } as const, initialWorld(freshProgress()))

type Site = {
  emit: (event: DomainEvent) => Promise<void>
  setPaneWanted: (paneWanted: boolean) => Promise<void>
  openPane: () => Promise<boolean>
  ensureLoop: () => Promise<void>
}

export const register: Register = (on, options) => {
  const configured = typeof options.harnessPath === 'string' ? options.harnessPath.trim() : ''
  const harness = configured === '' ? 'harness' : configured
  const mode: PixelMode = options.pixelMode === 'space' ? 'space' : 'half'

  let site: Site | undefined
  let anim: Anim = initialAnim()
  let view: View | undefined
  let loop: Timer | undefined
  let loopMs = 0
  let lastCells = ''

  const stopLoop = (): void => {
    loop?.cancel()
    loop = undefined
    loopMs = 0
  }

  on('session.start', async ($, e, next) => {
    let role: string | undefined
    try {
      role = await $.env.get('HARNESS_ROLE')
    } catch {
      role = undefined
    }
    if (role === 'worker') return next(e)

    let isTicking = false
    let isPolling = false

    const ensureLoop = async (): Promise<void> => {
      if (view === undefined) {
        stopLoop()
        return
      }
      const wanted = isAnimating(anim, await read($, world)) ? FRAME_MS : IDLE_MS
      if (loop !== undefined && loopMs === wanted) return
      stopLoop()
      loopMs = wanted
      loop = $.clock.every(wanted, () => {
        void tick()
      })
    }

    const tick = async (): Promise<void> => {
      if (isTicking) return
      isTicking = true
      try {
        const current = await read($, world)
        anim = step(anim, current)
        if (view !== undefined) {
          const cells = toCells(drawScene(current, anim), mode, view)
          if (cells !== lastCells) {
            const shown = await $.ui.blit({ requestId: PANE, key: RASTER_KEY, cells })
            if (shown.deny === undefined) lastCells = cells
            else view = undefined
          }
        }
        await ensureLoop()
      } catch {
        // a failed frame waits for the next tick
      } finally {
        isTicking = false
      }
    }

    const emit = async (event: DomainEvent): Promise<void> => {
      try {
        const now = await $.clock.now()
        const before = await read($, world)
        const preview = apply(before, event, now)
        if (preview.world === before && preview.cues.length === 0) return
        let cues: Cue[] = []
        let isProgressChanged = false
        const after = await update($, world, current => {
          const applied = apply(current, event, now)
          cues = applied.cues
          isProgressChanged = applied.world.progress !== current.progress
          return applied.world
        })
        for (const cue of cues) anim = applyCue(anim, cue)
        if (isProgressChanged) await $.store.set(PROGRESS_KEY, after.progress)
        await ensureLoop()
      } catch {
        // the poll or the next report brings the world back in line
      }
    }

    const setPaneWanted = async (paneWanted: boolean): Promise<void> => {
      const after = await update($, world, current => ({ ...current, progress: { ...current.progress, paneWanted } }))
      await $.store.set(PROGRESS_KEY, after.progress)
    }

    const openPane = async (): Promise<boolean> => {
      try {
        const opened = await $.ui.open({ id: PANE, title: PANE_TITLE, columns: 72 })
        return opened.isPlaced
      } catch {
        return false
      }
    }

    site = { emit, setPaneWanted, openPane, ensureLoop }

    try {
      const progress = parseProgress(await $.store.get(PROGRESS_KEY))
      await update($, world, () => initialWorld(progress))
    } catch {
      // keep the fresh world
    }
    try {
      await $.command.register({
        name: 'pyramid',
        description: 'Toggle the pyramid construction site pane; `/pyramid gallery` lists finished wonders',
        argumentHint: '[gallery]',
        immediate: true,
      })
    } catch {
      // the pane still opens from paneWanted
    }

    const poll = async (): Promise<void> => {
      if (isPolling) return
      isPolling = true
      try {
        const ran = await $.process.run([harness, 'status'], { timeoutMs: RUN_TIMEOUT_MS })
        if (ran.exitCode === 0) await emit({ kind: 'status', polled: parseStatus(ran.stdout) })
      } catch {
        // harness missing or slow: keep the last known states
      } finally {
        isPolling = false
      }
    }
    void poll()
    $.clock.every(POLL_MS, () => {
      void poll()
    })

    try {
      if ((await read($, world)).progress.paneWanted) await openPane()
    } catch {
      // the person can open it with /pyramid
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (site === undefined) return next(e)
    const current = await read($, world)
    const segments = statusSegments(current)
    const { Box, Text } = $.ui.resolve(e)
    const row = (
      <Text wrap="truncate-end">
        {segments.map(segment => (segment.color === undefined ? segment.text : <Text color={segment.color}>{segment.text}</Text>))}
      </Text>
    )
    if (e.surface !== 'terminal') {
      view = undefined
      return (
        <Box key="pyramid-site" flexDirection="column">
          {row}
        </Box>
      )
    }
    const { Raster } = $.ui.resolve(e)
    const nextView = fitView(e.props.bodyColumns, e.props.scroll.bodyRows)
    const cells = toCells(drawScene(current, anim), mode, nextView)
    view = nextView
    lastCells = cells
    void site.ensureLoop()
    return (
      <Box key="pyramid-site" flexDirection="column">
        <Raster key={RASTER_KEY} columns={nextView.columns} rows={nextView.rows} cells={cells} />
        {row}
      </Box>
    )
  })

  on('tool.call', async (_$, e, next) => {
    if (site === undefined || e.tool !== 'Bash') return next(e)
    const call = parseHarnessCall(e.command)
    if (call === undefined) return next(e)
    if (call.verb === 'ask') await site.emit({ kind: 'ask', worker: call.worker })
    const result = await next(e)
    const event = interpretResult(call, result)
    if (event !== undefined) await site.emit(event)
    return result
  })

  on('prompt.submit', async (_$, e, next) => {
    const result = await next(e)
    if (site !== undefined && e.origin.kind === 'composer' && e.command === undefined && e.isMeta !== true) {
      await site.emit({ kind: 'caravan' })
    }
    return result
  })
}
