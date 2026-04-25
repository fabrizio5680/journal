import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export type DictationState = 'idle' | 'listening' | 'error'

export interface UseDictationReturn {
  isSupported: boolean
  state: DictationState
  errorMessage: string | null
  interimTranscript: string | null
  start: () => void
  stop: () => void
}

const MAX_SILENT_RESTARTS = 5

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

function getDeltaTranscript(previous: string, current: string): string {
  const previousWords = splitWords(previous)
  const currentWords = splitWords(current)

  if (currentWords.length === 0) return ''
  if (previousWords.length === 0) return currentWords.join(' ')

  // Some engines emit cumulative phrases (e.g. "hello", then "hello world").
  // Emit only the suffix that wasn't already emitted.
  if (
    currentWords.length >= previousWords.length &&
    previousWords.every((word, index) => currentWords[index] === word)
  ) {
    return currentWords.slice(previousWords.length).join(' ')
  }

  // Also handle partial overlap between consecutive final results.
  const maxOverlap = Math.min(previousWords.length, currentWords.length)
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const previousSuffix = previousWords.slice(previousWords.length - overlap)
    const currentPrefix = currentWords.slice(0, overlap)
    const isOverlap = previousSuffix.every((word, index) => currentPrefix[index] === word)

    if (isOverlap) {
      return currentWords.slice(overlap).join(' ')
    }
  }

  return currentWords.join(' ')
}

export function useDictation(onTranscript: (text: string) => void): UseDictationReturn {
  const SpeechRecognitionClass =
    typeof window !== 'undefined'
      ? ((window as Window & { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
        (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor })
          .webkitSpeechRecognition)
      : undefined

  const isSupported = Boolean(SpeechRecognitionClass)

  const [state, setState] = useState<DictationState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [interimTranscript, setInterimTranscript] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const stateRef = useRef<DictationState>('idle')
  const silentRestartCountRef = useRef(0)
  const lastFinalTranscriptRef = useRef('')
  const langFallbackRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)

  // Keep transcript callback ref current without re-creating recognition
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const createRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!SpeechRecognitionClass) return null

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          setInterimTranscript(null)
          const transcript = result[0].transcript.trim()
          if (transcript) {
            const deltaTranscript = getDeltaTranscript(lastFinalTranscriptRef.current, transcript)
            if (deltaTranscript) {
              onTranscriptRef.current(deltaTranscript)
            }
            lastFinalTranscriptRef.current = transcript
          }
        } else {
          setInterimTranscript(result[0].transcript)
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stateRef.current = 'error'
        setState('error')
        setErrorMessage('Microphone permission denied')
      } else if (event.error === 'network') {
        stateRef.current = 'error'
        setState('error')
        setErrorMessage('Connection required for voice')
      } else if (event.error === 'audio-capture') {
        stateRef.current = 'error'
        setState('error')
        setErrorMessage('No microphone found')
      } else if (event.error === 'language-not-supported') {
        if (!langFallbackRef.current) {
          langFallbackRef.current = true
          recognition.lang = 'en-US'
          try {
            recognition.start()
          } catch {
            // ignore if already starting
          }
        }
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        // no-speech handled in onend; aborted is intentional — both silent
      }
    }

    recognition.onend = () => {
      if (stateRef.current !== 'listening') return

      if (silentRestartCountRef.current < MAX_SILENT_RESTARTS) {
        silentRestartCountRef.current += 1
        setTimeout(() => {
          if (stateRef.current === 'listening') {
            recognitionRef.current?.start()
          }
        }, 2000)
      } else {
        // Exceeded max restarts — give up gracefully
        stateRef.current = 'idle'
        setState('idle')
        silentRestartCountRef.current = 0
      }
    }

    return recognition
  }, [SpeechRecognitionClass])

  const start = useCallback(() => {
    if (!isSupported || stateRef.current === 'listening') return

    setErrorMessage(null)
    silentRestartCountRef.current = 0
    lastFinalTranscriptRef.current = ''
    langFallbackRef.current = false

    const recognition = createRecognition()
    if (!recognition) return

    recognitionRef.current = recognition
    stateRef.current = 'listening'
    setState('listening')
    recognition.start()
  }, [isSupported, createRecognition])

  const stop = useCallback(() => {
    stateRef.current = 'idle'
    setState('idle')
    silentRestartCountRef.current = 0
    lastFinalTranscriptRef.current = ''
    setInterimTranscript(null)
    recognitionRef.current?.abort()
    recognitionRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  return { isSupported, state, errorMessage, interimTranscript, start, stop }
}
