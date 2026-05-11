#!/usr/bin/env node
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { google } from 'googleapis'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const DEFAULT_ROOT_FOLDER = 'Quiet Dwelling'
const DEFAULT_TOKEN_PATH = path.join(repoRoot, '.migration-auth', 'google-drive-token.json')
const DEFAULT_REPORT_DIR = path.join(repoRoot, '.migration-reports')

function parseArgs(argv) {
  const args = {
    execute: false,
    includeDeleted: false,
    force: false,
    help: false,
    userId: process.env.MIGRATE_USER_ID,
    projectId: process.env.FIREBASE_PROJECT_ID || 'journal-manna',
    serviceAccountPath:
      process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(repoRoot, 'service-account.json'),
    oauthClientPath: process.env.GOOGLE_DRIVE_OAUTH_CLIENT,
    tokenPath: process.env.GOOGLE_DRIVE_TOKEN_PATH || DEFAULT_TOKEN_PATH,
    reportDir: process.env.MIGRATION_REPORT_DIR || DEFAULT_REPORT_DIR,
    rootFolder: process.env.GOOGLE_DRIVE_ROOT_FOLDER || DEFAULT_ROOT_FOLDER,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--execute') args.execute = true
    else if (arg === '--dry-run') args.execute = false
    else if (arg === '--include-deleted') args.includeDeleted = true
    else if (arg === '--force') args.force = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (arg.startsWith('--user-id=')) args.userId = arg.slice('--user-id='.length)
    else if (arg === '--user-id') args.userId = argv[++i]
    else if (arg.startsWith('--project-id=')) args.projectId = arg.slice('--project-id='.length)
    else if (arg === '--project-id') args.projectId = argv[++i]
    else if (arg.startsWith('--service-account=')) {
      args.serviceAccountPath = arg.slice('--service-account='.length)
    } else if (arg === '--service-account') args.serviceAccountPath = argv[++i]
    else if (arg.startsWith('--oauth-client=')) {
      args.oauthClientPath = arg.slice('--oauth-client='.length)
    } else if (arg === '--oauth-client') args.oauthClientPath = argv[++i]
    else if (arg.startsWith('--token-path=')) args.tokenPath = arg.slice('--token-path='.length)
    else if (arg === '--token-path') args.tokenPath = argv[++i]
    else if (arg.startsWith('--report-dir=')) args.reportDir = arg.slice('--report-dir='.length)
    else if (arg === '--report-dir') args.reportDir = argv[++i]
    else if (arg.startsWith('--root-folder=')) args.rootFolder = arg.slice('--root-folder='.length)
    else if (arg === '--root-folder') args.rootFolder = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

function printHelp() {
  console.log(`
Migrate Quiet Dwelling Firestore entries to Google Drive.

Dry-run is the default. Add --execute to create folders and upload/update files.

Required:
  MIGRATE_USER_ID or --user-id             Firebase user id to migrate
  GOOGLE_DRIVE_OAUTH_CLIENT or --oauth-client
                                           OAuth client JSON downloaded from Google Cloud

Usually required:
  GOOGLE_APPLICATION_CREDENTIALS or --service-account
                                           Firebase service account JSON

Options:
  --execute                                Actually write to Google Drive
  --dry-run                                Preview only (default)
  --include-deleted                        Include entries where deleted === true
  --force                                  Update Drive files even when content is identical
  --project-id journal-manna               Firebase project id
  --root-folder "Quiet Dwelling"           Drive root folder name
  --token-path .migration-auth/token.json  OAuth token cache path
  --report-dir .migration-reports          Local report output directory
`)
}

async function readJson(filePath) {
  const absolutePath = path.resolve(filePath)
  const raw = await fs.readFile(absolutePath, 'utf8')
  return JSON.parse(raw)
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function normalizeEntry(docId, data) {
  const date = typeof data.date === 'string' ? data.date : docId
  const contentText = typeof data.contentText === 'string' ? data.contentText : ''
  const moodLabel = typeof data.moodLabel === 'string' ? data.moodLabel : null
  const tags = Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === 'string') : []
  const scriptureRefs = Array.isArray(data.scriptureRefs) ? data.scriptureRefs : []

  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    migratedFrom: {
      provider: 'firebase-firestore',
      projectId: null,
      documentPath: null,
      migratedAt: new Date().toISOString(),
    },
    date,
    content: data.content ?? { type: 'doc', content: [] },
    contentText,
    searchText: buildSearchText({ contentText, moodLabel, tags, scriptureRefs }),
    mood: data.mood ?? null,
    moodLabel,
    tags,
    scriptureRefs,
    wordCount: typeof data.wordCount === 'number' ? data.wordCount : countWords(contentText),
    deleted: data.deleted === true,
    deletedAt: timestampToIso(data.deletedAt),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt) || new Date().toISOString(),
  }
}

function buildSearchText({ contentText, moodLabel, tags, scriptureRefs }) {
  const scriptures = scriptureRefs
    .map((ref) => (typeof ref?.reference === 'string' ? ref.reference : null))
    .filter(Boolean)

  return [
    contentText,
    moodLabel ? `#mood: ${moodLabel}` : '',
    tags.length > 0 ? `#tags: ${tags.join(' ')}` : '',
    scriptures.length > 0 ? `#scripture: ${scriptures.join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function countWords(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function timestampToIso(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'string') return value
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString()
  return null
}

async function initFirestore({ projectId, serviceAccountPath }) {
  if (getApps().length > 0) return getFirestore()

  const serviceAccount = await readJson(serviceAccountPath)
  initializeApp({
    credential: cert(serviceAccount),
    projectId,
  })
  return getFirestore()
}

async function fetchEntries(db, { userId, includeDeleted, projectId }) {
  const snapshot = await db.collection('users').doc(userId).collection('entries').get()
  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      const entry = normalizeEntry(doc.id, data)
      entry.migratedFrom.projectId = projectId
      entry.migratedFrom.documentPath = `users/${userId}/entries/${doc.id}`
      return { id: doc.id, entry }
    })
    .filter(({ entry }) => includeDeleted || entry.deleted !== true)
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
}

async function getOAuthClient({ oauthClientPath, tokenPath }) {
  if (!oauthClientPath) {
    throw new Error('Missing GOOGLE_DRIVE_OAUTH_CLIENT or --oauth-client')
  }

  const clientConfig = await readJson(oauthClientPath)
  const webOrInstalled = clientConfig.installed || clientConfig.web
  if (!webOrInstalled) {
    throw new Error('OAuth client JSON must contain an "installed" or "web" client')
  }

  const clientId = webOrInstalled.client_id
  const clientSecret = webOrInstalled.client_secret
  const redirectUri = 'http://127.0.0.1:53682/oauth2callback'
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  if (await pathExists(tokenPath)) {
    oauth2Client.setCredentials(await readJson(tokenPath))
    return oauth2Client
  }

  const token = await requestOAuthToken(oauth2Client)
  await fs.mkdir(path.dirname(tokenPath), { recursive: true })
  await fs.writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`)
  oauth2Client.setCredentials(token)
  console.log(`Saved Google Drive OAuth token to ${path.relative(repoRoot, tokenPath)}`)
  return oauth2Client
}

async function requestOAuthToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
  })

  console.log('\nOpen this URL to authorize Google Drive access:\n')
  console.log(authUrl)
  console.log('\nWaiting for OAuth callback on http://127.0.0.1:53682/oauth2callback ...')

  const code = await waitForOAuthCode()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1:53682')
        if (reqUrl.pathname !== '/oauth2callback') {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        const error = reqUrl.searchParams.get('error')
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end(`Authorization failed: ${error}`)
          server.close()
          reject(new Error(`OAuth authorization failed: ${error}`))
          return
        }

        const code = reqUrl.searchParams.get('code')
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing authorization code')
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<p>Quiet Dwelling migration is authorized. You can close this tab.</p>')
        server.close()
        resolve(code)
      } catch (err) {
        server.close()
        reject(err)
      }
    })

    server.on('error', reject)
    server.listen(53682, '127.0.0.1')
  })
}

async function findFolder(drive, name, parentId) {
  const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents"
  const res = await drive.files.list({
    q: [
      `name = '${escapeDriveQueryValue(name)}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
      parentQuery,
    ].join(' and '),
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  })
  return res.data.files?.[0] ?? null
}

async function ensureFolder(drive, name, parentId, { execute, report }) {
  const canQueryParent = !parentId?.startsWith('dry-run:')
  const existing = canQueryParent ? await findFolder(drive, name, parentId) : null
  if (existing?.id) {
    report.folders.push({ action: 'found', name, id: existing.id, parentId })
    return existing.id
  }

  if (!execute) {
    const dryRunId = `dry-run:${parentId || 'root'}/${name}`
    report.folders.push({ action: 'would-create', name, id: dryRunId, parentId })
    return dryRunId
  }

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  })

  const id = res.data.id
  if (!id) throw new Error(`Google Drive did not return an id for folder ${name}`)
  report.folders.push({ action: 'created', name, id, parentId })
  return id
}

async function findFile(drive, name, parentId) {
  const res = await drive.files.list({
    q: [
      `name = '${escapeDriveQueryValue(name)}'`,
      `'${parentId}' in parents`,
      'trashed = false',
      "mimeType != 'application/vnd.google-apps.folder'",
    ].join(' and '),
    fields: 'files(id, name, md5Checksum, modifiedTime, size)',
    spaces: 'drive',
    pageSize: 1,
  })
  return res.data.files?.[0] ?? null
}

async function getExistingJson(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
}

async function uploadEntryFile(drive, folderId, fileName, content, options) {
  const { execute, force } = options
  const existing = execute ? await findFile(drive, fileName, folderId) : null
  const contentWithNewline = `${content}\n`

  if (!execute) {
    return {
      action: 'would-upload',
      fileName,
      fileId: null,
      drivePath: options.drivePath,
    }
  }

  if (existing?.id) {
    if (!force) {
      const existingContent = await getExistingJson(drive, existing.id)
      if (existingContent.trim() === content.trim()) {
        return {
          action: 'skipped-identical',
          fileName,
          fileId: existing.id,
          drivePath: options.drivePath,
        }
      }
    }

    const res = await drive.files.update({
      fileId: existing.id,
      media: {
        mimeType: 'application/json',
        body: contentWithNewline,
      },
      fields: 'id, modifiedTime',
    })
    return {
      action: 'updated',
      fileName,
      fileId: res.data.id,
      modifiedTime: res.data.modifiedTime,
      drivePath: options.drivePath,
    }
  }

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/json',
      body: contentWithNewline,
    },
    fields: 'id, modifiedTime',
  })

  return {
    action: 'created',
    fileName,
    fileId: res.data.id,
    modifiedTime: res.data.modifiedTime,
    drivePath: options.drivePath,
  }
}

async function migrateEntries({ entries, drive, args, report }) {
  const folderCache = new Map()

  async function folder(name, parentId) {
    const key = `${parentId || 'root'}/${name}`
    if (folderCache.has(key)) return folderCache.get(key)
    const id = await ensureFolder(drive, name, parentId, { execute: args.execute, report })
    folderCache.set(key, id)
    return id
  }

  const rootId = await folder(args.rootFolder, null)
  const entriesId = await folder('entries', rootId)

  for (const { id, entry } of entries) {
    const [year, month] = entry.date.split('-')
    if (!year || !month) {
      report.entries.push({
        firestoreId: id,
        action: 'error',
        error: `Invalid date: ${entry.date}`,
      })
      continue
    }

    const yearId = await folder(year, entriesId)
    const monthId = await folder(month, yearId)
    const fileName = `${entry.date}.json`
    const drivePath = `${args.rootFolder}/entries/${year}/${month}/${fileName}`
    const content = JSON.stringify(entry, null, 2)

    try {
      const result = await uploadEntryFile(drive, monthId, fileName, content, {
        execute: args.execute,
        force: args.force,
        drivePath,
      })
      report.entries.push({
        firestoreId: id,
        date: entry.date,
        wordCount: entry.wordCount,
        ...result,
      })
      console.log(`${result.action}: ${drivePath}`)
    } catch (err) {
      report.entries.push({
        firestoreId: id,
        date: entry.date,
        action: 'error',
        drivePath,
        error: err instanceof Error ? err.message : String(err),
      })
      console.error(`error: ${drivePath}`)
      console.error(err)
    }
  }
}

async function writeReport(report, reportDir) {
  await fs.mkdir(reportDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(reportDir, `google-drive-entries-${timestamp}.json`)
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return reportPath
}

function summarize(report) {
  const counts = new Map()
  for (const entry of report.entries) {
    counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  if (!args.userId) throw new Error('Missing MIGRATE_USER_ID or --user-id')

  const report = {
    mode: args.execute ? 'execute' : 'dry-run',
    startedAt: new Date().toISOString(),
    projectId: args.projectId,
    userId: args.userId,
    rootFolder: args.rootFolder,
    includeDeleted: args.includeDeleted,
    force: args.force,
    folders: [],
    entries: [],
  }

  console.log(`${report.mode === 'dry-run' ? 'Dry run' : 'Execute'} migration for ${args.userId}`)
  const db = await initFirestore(args)
  const entries = await fetchEntries(db, args)
  console.log(`Fetched ${entries.length} Firestore entr${entries.length === 1 ? 'y' : 'ies'}`)

  const oauthClient = await getOAuthClient(args)
  const drive = google.drive({ version: 'v3', auth: oauthClient })
  await migrateEntries({ entries, drive, args, report })

  report.finishedAt = new Date().toISOString()
  report.summary = summarize(report)

  const reportPath = await writeReport(report, args.reportDir)
  console.log('\nSummary:', report.summary)
  console.log(`Report written to ${path.relative(repoRoot, reportPath)}`)
  if (!args.execute) {
    console.log('\nNo Google Drive files were changed. Re-run with --execute to upload.')
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
