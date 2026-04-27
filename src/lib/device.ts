export function isMobileDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}
