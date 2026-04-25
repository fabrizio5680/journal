import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useDictation } from './useDictation'

// --- Mock SpeechRecognition ---

type RecognitionEventHandler = (event: SpeechRecognitionEvent) => void
type ErrorEventHandler = (event: SpeechRecognitionErrorEvent) => void
type EndHandler = () => void

interface MockRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  onresult: RecognitionEventHandler | null
  onerror: ErrorEventHandler | null
  onend: EndHandler | null
}

let mockRecognitionInstance: MockRecognitionInstance | null = null

function installMockSpeechRecognition() {
  // Must be a real class/constructor — arrow functions can't be called with `new`
  class MockSpeechRecognition {
    continuous = false
    interimResults = false
    lang = ''
    start = vi.fn()
    stop = vi.fn()
    abort = vi.fn()
    onresult: RecognitionEventHandler | null = null
    onerror: ErrorEventHandler | null = null
    onend: EndHandler | null = null

    constructor() {
      // Capture this instance so tests can drive events
      mockRecognitionInstance = this as unknown as MockRecognitionInstance
    }
  }

  ;(window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition =
    MockSpeechRecognition as unknown
}

function fireResult(instance: MockRecognitionInstance, transcript: string, isFinal: boolean) {
  const event = {
    resultIndex: 0,
    results: [Object.assign([{ transcript, confidence: 1 }], { isFinal })],
  } as unknown as SpeechRecognitionEvent
  instance.onresult?.(event)
}

function fireError(instance: MockRecognitionInstance, error: string) {
  instance.onerror?.({ error } as SpeechRecognitionErrorEvent)
}

function fireEnd(instance: MockRecognitionInstance) {
  instance.onend?.()
}

describe('useDictation', () => {
  beforeEach(() => {
    mockRecognitionInstance = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition
    delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it('isSupported = false when SpeechRecognition not in window', () => {
    const { result } = renderHook(() => useDictation(vi.fn()))
    expect(result.current.isSupported).toBe(false)
  })

  it('isSupported = true when SpeechRecognition is present', () => {
    installMockSpeechRecognition()
    const { result } = renderHook(() => useDictation(vi.fn()))
    expect(result.current.isSupported).toBe(true)
  })

  it('state transitions idle → listening on start()', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))
    expect(result.current.state).toBe('idle')

    act(() => {
      result.current.start()
    })

    expect(result.current.state).toBe('listening')
    expect(mockRecognitionInstance?.start).toHaveBeenCalledOnce()
  })

  it('state transitions listening → idle on stop()', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })
    expect(result.current.state).toBe('listening')

    act(() => {
      result.current.stop()
    })

    expect(result.current.state).toBe('idle')
    expect(mockRecognitionInstance?.abort).toHaveBeenCalledOnce()
  })

  it('onTranscript called when final result fires', () => {
    installMockSpeechRecognition()

    const onTranscript = vi.fn()
    const { result } = renderHook(() => useDictation(onTranscript))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireResult(mockRecognitionInstance!, 'hello world', true)
    })

    expect(onTranscript).toHaveBeenCalledWith('hello world')
  })

  it('onTranscript NOT called for interim (non-final) results', () => {
    installMockSpeechRecognition()

    const onTranscript = vi.fn()
    const { result } = renderHook(() => useDictation(onTranscript))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireResult(mockRecognitionInstance!, 'partial text', false)
    })

    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('emits only new words when final transcripts are cumulative', () => {
    installMockSpeechRecognition()

    const onTranscript = vi.fn()
    const { result } = renderHook(() => useDictation(onTranscript))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireResult(mockRecognitionInstance!, 'hello', true)
      fireResult(mockRecognitionInstance!, 'hello world', true)
    })

    expect(onTranscript).toHaveBeenNthCalledWith(1, 'hello')
    expect(onTranscript).toHaveBeenNthCalledWith(2, 'world')
    expect(onTranscript).toHaveBeenCalledTimes(2)
  })

  it('emits only non-overlapping suffix for overlapping final transcripts', () => {
    installMockSpeechRecognition()

    const onTranscript = vi.fn()
    const { result } = renderHook(() => useDictation(onTranscript))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireResult(mockRecognitionInstance!, 'we can do this', true)
      fireResult(mockRecognitionInstance!, 'do this together', true)
    })

    expect(onTranscript).toHaveBeenNthCalledWith(1, 'we can do this')
    expect(onTranscript).toHaveBeenNthCalledWith(2, 'together')
    expect(onTranscript).toHaveBeenCalledTimes(2)
  })

  it('state = error and errorMessage set when not-allowed error fires', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireError(mockRecognitionInstance!, 'not-allowed')
    })

    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toBe('Microphone permission denied')
  })

  it('silent restart after no-speech: restarts after 2s', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    const firstInstance = mockRecognitionInstance!
    expect(firstInstance.start).toHaveBeenCalledTimes(1)

    // Simulate no-speech → onend fires while still listening
    act(() => {
      fireEnd(firstInstance)
    })

    // After 2s, should restart on the same instance
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(firstInstance.start).toHaveBeenCalledTimes(2)
    expect(result.current.state).toBe('listening')
  })

  it('transitions to idle after max silent restarts exceeded', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    const instance = mockRecognitionInstance!

    // Fire onend MAX_SILENT_RESTARTS (5) + 1 times
    for (let i = 0; i <= 5; i++) {
      act(() => {
        fireEnd(instance)
      })
      act(() => {
        vi.advanceTimersByTime(2000)
      })
    }

    expect(result.current.state).toBe('idle')
  })

  it('abort() called on explicit stop (not stop())', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    const instance = mockRecognitionInstance!

    act(() => {
      result.current.stop()
    })

    expect(instance.abort).toHaveBeenCalledOnce()
    expect(instance.stop).not.toHaveBeenCalled()
  })

  it('abort() called on unmount (cleanup)', () => {
    installMockSpeechRecognition()

    const { result, unmount } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    const instance = mockRecognitionInstance!
    expect(instance.abort).not.toHaveBeenCalled()

    unmount()

    expect(instance.abort).toHaveBeenCalledOnce()
  })

  it('configures recognition with continuous = true and interimResults = true', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    expect(mockRecognitionInstance?.continuous).toBe(true)
    expect(mockRecognitionInstance?.interimResults).toBe(true)
  })

  it('interimTranscript set for non-final result', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireResult(mockRecognitionInstance!, 'hello wor', false)
    })

    expect(result.current.interimTranscript).toBe('hello wor')
  })

  it('interimTranscript cleared when final result fires', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
      fireResult(mockRecognitionInstance!, 'hello wor', false)
    })

    act(() => {
      fireResult(mockRecognitionInstance!, 'hello world', true)
    })

    expect(result.current.interimTranscript).toBeNull()
  })

  it('interimTranscript cleared on stop()', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
      fireResult(mockRecognitionInstance!, 'hello wor', false)
    })

    act(() => {
      result.current.stop()
    })

    expect(result.current.interimTranscript).toBeNull()
  })

  it('network error sets state=error with correct message', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireError(mockRecognitionInstance!, 'network')
    })

    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toBe('Connection required for voice')
  })

  it('audio-capture error sets state=error with correct message', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireError(mockRecognitionInstance!, 'audio-capture')
    })

    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toBe('No microphone found')
  })

  it('service-not-allowed error sets state=error same as not-allowed', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireError(mockRecognitionInstance!, 'service-not-allowed')
    })

    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toBe('Microphone permission denied')
  })

  it('aborted error is silent — no state change', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    act(() => {
      fireError(mockRecognitionInstance!, 'aborted')
    })

    expect(result.current.state).toBe('listening')
    expect(result.current.errorMessage).toBeNull()
  })

  it('language-not-supported: silent, retries with en-US once', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    const instance = mockRecognitionInstance!
    const startCallsBefore = instance.start.mock.calls.length

    act(() => {
      fireError(instance, 'language-not-supported')
    })

    expect(result.current.state).toBe('listening')
    expect(result.current.errorMessage).toBeNull()
    expect(instance.lang).toBe('en-US')
    expect(instance.start).toHaveBeenCalledTimes(startCallsBefore + 1)
  })

  it('language-not-supported: does not retry more than once', () => {
    installMockSpeechRecognition()

    const { result } = renderHook(() => useDictation(vi.fn()))

    act(() => {
      result.current.start()
    })

    const instance = mockRecognitionInstance!

    act(() => {
      fireError(instance, 'language-not-supported')
      fireError(instance, 'language-not-supported')
    })

    // initial start (1) + one fallback retry (1) = 2 total
    expect(instance.start).toHaveBeenCalledTimes(2)
  })
})
