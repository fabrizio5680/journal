export class EncryptionLockedError extends Error {
  constructor() {
    super('Entry is encrypted and the session is locked')
    this.name = 'EncryptionLockedError'
  }
}
