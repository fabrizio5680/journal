import { describe, it, expect } from 'vitest'

import { parseScriptureRef, ScriptureParseError } from './scriptureParser'

describe('parseScriptureRef', () => {
  describe('valid single verse', () => {
    it('John 3:16 → JHN.3.16', () => {
      expect(parseScriptureRef('John 3:16').passageId).toBe('JHN.3.16')
    })

    it('Genesis 1:1 → GEN.1.1', () => {
      expect(parseScriptureRef('Genesis 1:1').passageId).toBe('GEN.1.1')
    })

    it('Revelation 22:13 → REV.22.13', () => {
      expect(parseScriptureRef('Revelation 22:13').passageId).toBe('REV.22.13')
    })

    it('Proverbs 3:5 → PRO.3.5', () => {
      expect(parseScriptureRef('Proverbs 3:5').passageId).toBe('PRO.3.5')
    })
  })

  describe('valid verse range', () => {
    it('Psalm 23:1-4 → PSA.23.1-PSA.23.4', () => {
      expect(parseScriptureRef('Psalm 23:1-4').passageId).toBe('PSA.23.1-PSA.23.4')
    })

    it('supports en-dash as range separator', () => {
      expect(parseScriptureRef('Romans 8:28–30').passageId).toBe('ROM.8.28-ROM.8.30')
    })

    it('1 Corinthians 13:4-7 → 1CO.13.4-1CO.13.7', () => {
      expect(parseScriptureRef('1 Corinthians 13:4-7').passageId).toBe('1CO.13.4-1CO.13.7')
    })

    it('spaces around dash are tolerated', () => {
      expect(parseScriptureRef('John 3:16 - 17').passageId).toBe('JHN.3.16-JHN.3.17')
    })
  })

  describe('common aliases', () => {
    it('Jn 3:16 → JHN.3.16', () => {
      expect(parseScriptureRef('Jn 3:16').passageId).toBe('JHN.3.16')
    })

    it('Ps 23:1 → PSA.23.1', () => {
      expect(parseScriptureRef('Ps 23:1').passageId).toBe('PSA.23.1')
    })

    it('1 Cor 13:4 → 1CO.13.4', () => {
      expect(parseScriptureRef('1 Cor 13:4').passageId).toBe('1CO.13.4')
    })

    it('Gen 1:1 → GEN.1.1', () => {
      expect(parseScriptureRef('Gen 1:1').passageId).toBe('GEN.1.1')
    })

    it('Rev 22:13 → REV.22.13', () => {
      expect(parseScriptureRef('Rev 22:13').passageId).toBe('REV.22.13')
    })

    it('Matt 5:9 → MAT.5.9', () => {
      expect(parseScriptureRef('Matt 5:9').passageId).toBe('MAT.5.9')
    })

    it('Rom 8:28 → ROM.8.28', () => {
      expect(parseScriptureRef('Rom 8:28').passageId).toBe('ROM.8.28')
    })

    it('Eph 2:8 → EPH.2.8', () => {
      expect(parseScriptureRef('Eph 2:8').passageId).toBe('EPH.2.8')
    })

    it('Psa 23:1 → PSA.23.1', () => {
      expect(parseScriptureRef('Psa 23:1').passageId).toBe('PSA.23.1')
    })

    it('Psalms 119:105 → PSA.119.105', () => {
      expect(parseScriptureRef('Psalms 119:105').passageId).toBe('PSA.119.105')
    })
  })

  describe('multi-word books', () => {
    it('1 Corinthians 13:4 → 1CO.13.4', () => {
      expect(parseScriptureRef('1 Corinthians 13:4').passageId).toBe('1CO.13.4')
    })

    it('Song of Solomon 1:1 → SNG.1.1', () => {
      expect(parseScriptureRef('Song of Solomon 1:1').passageId).toBe('SNG.1.1')
    })

    it('Song of Songs 2:4 → SNG.2.4', () => {
      expect(parseScriptureRef('Song of Songs 2:4').passageId).toBe('SNG.2.4')
    })

    it('1 Samuel 17:4 → 1SA.17.4', () => {
      expect(parseScriptureRef('1 Samuel 17:4').passageId).toBe('1SA.17.4')
    })

    it('2 Kings 2:11 → 2KI.2.11', () => {
      expect(parseScriptureRef('2 Kings 2:11').passageId).toBe('2KI.2.11')
    })

    it('First Samuel 1:1 → 1SA.1.1', () => {
      expect(parseScriptureRef('First Samuel 1:1').passageId).toBe('1SA.1.1')
    })
  })

  describe('case insensitivity', () => {
    it('lowercase john 3:16 → JHN.3.16', () => {
      expect(parseScriptureRef('john 3:16').passageId).toBe('JHN.3.16')
    })

    it('uppercase JOHN 3:16 → JHN.3.16', () => {
      expect(parseScriptureRef('JOHN 3:16').passageId).toBe('JHN.3.16')
    })

    it('mixed case JoHn 3:16 → JHN.3.16', () => {
      expect(parseScriptureRef('JoHn 3:16').passageId).toBe('JHN.3.16')
    })
  })

  describe('whitespace trimming', () => {
    it('leading/trailing whitespace is stripped', () => {
      expect(parseScriptureRef('  John 3:16  ').passageId).toBe('JHN.3.16')
    })
  })

  describe('throws ScriptureParseError', () => {
    it('throws for unknown book', () => {
      expect(() => parseScriptureRef('Hezekiah 3:16')).toThrow(ScriptureParseError)
    })

    it('throws for completely invalid format (no chapter:verse)', () => {
      expect(() => parseScriptureRef('John')).toThrow(ScriptureParseError)
    })

    it('throws for bad format (missing verse number)', () => {
      expect(() => parseScriptureRef('John 3')).toThrow(ScriptureParseError)
    })

    it('throws for empty string', () => {
      expect(() => parseScriptureRef('')).toThrow(ScriptureParseError)
    })

    it('throws for whitespace-only string', () => {
      expect(() => parseScriptureRef('   ')).toThrow(ScriptureParseError)
    })

    it('thrown error is instance of ScriptureParseError', () => {
      try {
        parseScriptureRef('NotABook 1:1')
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(ScriptureParseError)
        expect(e).toBeInstanceOf(Error)
      }
    })

    it('error message mentions the unknown book', () => {
      try {
        parseScriptureRef('Fictitious 1:1')
        expect.fail('should have thrown')
      } catch (e) {
        expect((e as ScriptureParseError).message).toContain('Fictitious')
      }
    })

    it('error message suggests correct format for bad format', () => {
      try {
        parseScriptureRef('invalid input here')
        expect.fail('should have thrown')
      } catch (e) {
        expect((e as ScriptureParseError).message).toMatch(/format/i)
      }
    })
  })
})
