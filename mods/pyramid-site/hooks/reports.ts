export type ReportStatus = 'done' | 'partial' | 'blocked'

const FINDINGS_HEADING = /^##\s+Findings/i
const NEXT_HEADING = /^##\s/
const FINDING = /^\s*-\s*\[(Critical|Major|Important|Minor)\]/i
const STATUS = /^status:\s*(done|partial|blocked)\b/im

export function findingLines(markdown: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => FINDINGS_HEADING.test(line))
  if (start < 0) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => NEXT_HEADING.test(line))
  return end < 0 ? rest : rest.slice(0, end)
}

export function countFindings(markdown: string): number {
  return findingLines(markdown).filter(line => FINDING.test(line)).length
}

export function reportStatus(markdown: string): ReportStatus | undefined {
  const match = STATUS.exec(markdown)
  return match === null ? undefined : (match[1]!.toLowerCase() as ReportStatus)
}

export function reportId(markdown: string): string {
  const text = markdown.trim()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}-${text.length}`
}
