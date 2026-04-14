import { useCallback, useEffect, useRef, useState } from 'react'

export type DictationState = 'idle' | 'listening' | 'error'

export interface UseDictationReturn {
  isSupported: boolean
  state: DictationState
  errorMessage: string | null
  start: () => void
  stop: () => void
}

const MAX_SILENT_RESTARTS = 5

export function useDictation(onTranscript: (text: string) => void): UseDictationReturn {
  const SpeechRecognitionClass =
    typeof window !== 'undefined'
      ? ((window as typeof window & { SpeechRecognition?: typeof SpeechRecognition })
          .SpeechRecognition ??
        (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
          .webkitSpeechRecognition)
      : undefined

  const isSupported = Boolean(SpeechRecognitionClass)

  const [state, setState] = useState<DictationState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const stateRef = useRef<DictationState>('idle')
  const silentRestartCountRef = useRef(0)
  const onTranscriptRef = useRef(onTranscript)

  // Keep transcript callback ref current without re-creating recognition
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const createRecognition = useCallback((): SpeechRecognition | null => {
    if (!SpeechRecognitionClass) return null

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const transcript = result[0].transcript.trim()
          if (transcript) {
            onTranscriptRef.current(transcript)
          }
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        stateRef.current = 'error'
        setState('error')
        setErrorMessage('Microphone permission denied')
      } else if (event.error === 'no-speech') {
        // handled in onend — silent restart
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
    recognitionRef.current?.stop()
    recognitionRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      recognitionRef.current = null
    }
  }, [])

  return { isSupported, state, errorMessage, start, stop }
}
