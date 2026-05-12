export type DriveLoadProgress = { loaded: number; total: number }

type ProgressListener = (progress: DriveLoadProgress | null) => void

let current: DriveLoadProgress | null = null
const listeners = new Set<ProgressListener>()

export function setDriveLoadProgress(progress: DriveLoadProgress | null): void {
  current = progress
  listeners.forEach((l) => l(progress))
}

export function subscribeDriveLoadProgress(listener: ProgressListener): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}
