import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth'

import { auth } from '@/lib/firebase'

const FALLBACK_VERSE = {
  text: 'Be still, and know that I am God.',
  reference: 'Psalm 46:10',
}

export default function LoginPage() {
  const navigate = useNavigate()

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user || auth.currentUser) {
          navigate('/', { replace: true })
        }
      })
      .catch(console.error)
  }, [navigate])

  useEffect(() => {
    let isMounted = true

    auth
      .authStateReady()
      .then(() => {
        if (!isMounted) return
        if (auth.currentUser) {
          navigate('/', { replace: true })
        }
      })
      .catch(console.error)

    return () => {
      isMounted = false
    }
  }, [navigate])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user) navigate('/', { replace: true })
    })
  }, [navigate])

  async function handleSignIn() {
    const provider = new GoogleAuthProvider()
    const isMobileUserAgent = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isTouchDevice = navigator.maxTouchPoints > 0
    const shouldUseRedirect = isMobileUserAgent || isTouchDevice

    if (shouldUseRedirect) {
      await signInWithRedirect(auth, provider)
    } else {
      try {
        await signInWithPopup(auth, provider)
        navigate('/', { replace: true })
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
          await signInWithRedirect(auth, provider)
          return
        }
        throw error
      }
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left panel */}
      <div className="z-10 flex w-full flex-col justify-between px-10 py-12 md:w-[44%] md:px-14">
        {/* Top: Logo */}
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
            <span className="material-symbols-outlined text-primary text-[18px]">edit_note</span>
          </div>
          <div>
            <span className="font-display text-on-surface text-2xl font-semibold leading-none tracking-tight">
              Reflect
            </span>
            <p className="text-on-surface-variant/50 text-[9px] tracking-[0.2em] uppercase leading-none mt-0.5">
              The Quiet Sanctuary
            </p>
          </div>
        </div>

        {/* Middle: Hero */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="text-on-surface-variant/60 text-xs tracking-[0.2em] uppercase">
              Your private journal
            </p>
            <h1 className="font-display text-on-surface text-5xl font-light leading-[1.15] tracking-tight">
              A place to reflect,
              <br />
              <em>find peace,</em>
              <br />
              and grow.
            </h1>
            <p className="text-on-surface-variant text-base leading-relaxed max-w-xs">
              Write freely. Think clearly. Return to what matters.
            </p>
          </div>

          {/* Sign in */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSignIn}
              className="bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/50 hover:shadow-sm flex w-full items-center gap-3 rounded-full border px-6 py-3.5 text-sm font-medium transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        </div>

        {/* Bottom: Privacy */}
        <p className="text-on-surface-variant/40 text-[10px] tracking-[0.2em] uppercase">
          Private &amp; encrypted — only you can read your entries
        </p>
      </div>

      {/* Right panel — desktop only */}
      <div className="relative hidden flex-grow overflow-hidden md:flex">
        <img
          src="https://images.unsplash.com/photo-1482192505345-5852ba2f6585?w=1200&q=80"
          alt=""
          className="h-full w-full object-cover"
          aria-hidden="true"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-background/30 to-transparent" />

        {/* Scripture card */}
        <div className="absolute right-10 bottom-10 left-10 rounded-[2rem] bg-surface-container-lowest/80 p-8 backdrop-blur-2xl border border-white/30 shadow-xl">
          <p className="text-on-surface-variant/50 text-[9px] tracking-[0.25em] uppercase mb-3">
            Today's Word
          </p>
          <p className="font-display text-on-surface text-2xl font-light italic leading-relaxed mb-4">
            "{FALLBACK_VERSE.text}"
          </p>
          <p className="text-primary text-[10px] font-semibold tracking-[0.2em] uppercase">
            {FALLBACK_VERSE.reference}
          </p>
        </div>
      </div>
    </div>
  )
}
