import { useState } from 'react'

import ScriptureChip from '@/components/scripture/ScriptureChip'
import ScriptureRefInput from '@/components/scripture/ScriptureRefInput'
import type { ScriptureRef } from '@/types'

interface ScriptureBarProps {
  scriptureRefs: ScriptureRef[]
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'
  onScriptureRefsChange: (refs: ScriptureRef[]) => void
}

export default function ScriptureBar({
  scriptureRefs,
  scriptureTranslation,
  onScriptureRefsChange,
}: ScriptureBarProps) {
  const [showScriptureInput, setShowScriptureInput] = useState(false)

  function handleScriptureClick() {
    setShowScriptureInput((prev) => !prev)
  }

  function handleAddScriptureRef(ref: ScriptureRef) {
    onScriptureRefsChange([...scriptureRefs, ref])
    setShowScriptureInput(false)
  }

  function handleRemoveScriptureRef(passageId: string) {
    onScriptureRefsChange(scriptureRefs.filter((r) => r.passageId !== passageId))
  }

  return (
    <div className="bg-surface/90 border-outline-variant/10 sticky top-16 z-20 -mx-6 border-b px-6 py-2 backdrop-blur-sm md:top-[50px]">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
        {scriptureRefs.map((ref) => (
          <ScriptureChip
            key={ref.passageId}
            ref_={ref}
            translation={scriptureTranslation}
            onRemove={() => handleRemoveScriptureRef(ref.passageId)}
          />
        ))}

        <button
          type="button"
          onClick={handleScriptureClick}
          aria-label="Add scripture reference"
          className="text-on-surface-variant/40 hover:text-on-surface-variant flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        >
          + scripture
        </button>
      </div>

      {showScriptureInput && (
        <ScriptureRefInput translation={scriptureTranslation} onAdd={handleAddScriptureRef} />
      )}
    </div>
  )
}
