import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GoogleAuthProvider,
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
        if (result) navigate('/')
      })
      .catch(console.error)
  }, [navigate])

  async function handleSignIn() {
    const provider = new GoogleAuthProvider()
    const isMobile = /Mobi|Android/i.test(navigator.userAgent)
    if (isMobile) {
      await signInWithRedirect(auth, provider)
    } else {
      await signInWithPopup(auth, provider)
      navigate('/')
    }
  }

  return (
    <div className="flex h-screen">
      {/* Left panel */}
      <div className="bg-surface-container-lowest z-10 flex w-full flex-col justify-center px-12 md:w-[45%]">
        <div className="flex flex-col gap-10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-primary-container flex h-10 w-10 items-center justify-center rounded-xl">
              <span className="material-symbols-outlined text-on-primary-container">edit_note</span>
            </div>
            <span className="text-on-surface text-xl font-black">The Quiet Sanctuary</span>
          </div>

          {/* Hero */}
          <div className="flex flex-col gap-3">
            <h1 className="text-on-surface text-4xl font-extrabold">
              A place to reflect,
              <br />
              find peace, and grow.
            </h1>
            <p className="text-on-surface-variant">
              Your private journal — beautifully simple, deeply personal.
            </p>
          </div>

          {/* Google Sign-In */}
          <button
            onClick={handleSignIn}
            className="border-outline-variant/20 bg-surface-container hover:bg-surface-container-high flex w-full items-center gap-3 rounded-full border px-6 py-4 font-semibold transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
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
            Continue with Google
          </button>
        </div>

        {/* Privacy note */}
        <p className="text-on-surface-variant/60 mt-auto text-[10px] tracking-[0.2em] uppercase">
          Your entries are private &amp; encrypted
        </p>
      </div>

      {/* Right panel — desktop only */}
      <div className="relative hidden flex-grow overflow-hidden md:flex">
        <img
          src="https://images.unsplash.com/photo-1482192505345-5852ba2f6585?w=1200&q=80"
          alt=""
          className="h-full w-full object-cover grayscale-[20%]"
          aria-hidden="true"
        />

        {/* Scripture card */}
        <div className="border-surface-container-lowest/30 bg-surface/70 absolute right-12 bottom-12 left-12 rounded-[2rem] border p-8 backdrop-blur-2xl">
          <span className="material-symbols-outlined text-on-surface-variant mb-4">
            format_quote
          </span>
          <p className="text-on-surface mb-4 text-2xl font-light italic">"{FALLBACK_VERSE.text}"</p>
          <p className="text-on-surface-variant text-sm font-medium">{FALLBACK_VERSE.reference}</p>
        </div>
      </div>
    </div>
  )
}
