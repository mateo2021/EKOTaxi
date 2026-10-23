// Uruchamianie Claude Code w trybie headless (`claude -p`) dla jednego pytania.
// Bezpieczeństwo: pytania pochodzą od dowolnych użytkowników aplikacji, a proces działa
// na komputerze właściciela — więc: bez shella, bez narzędzi, bez MCP, bez ustawień,
// hooków i wtyczek użytkownika, własny prompt systemowy zamiast domyślnego, pytanie
// tylko przez stdin, pusty katalog tymczasowy jako cwd, bez sekretów Supabase w env.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SYSTEM_PROMPT } from './prompt.mjs'

// Druga warstwa. Główną kontrolą jest `--tools ""` (zero wbudowanych narzędzi)
// i `--strict-mcp-config` (zero serwerów MCP); ta lista działa, gdyby tamte zawiodły.
export const DISALLOWED_TOOLS = 'Bash Edit Write Read Glob Grep WebFetch WebSearch NotebookEdit Task mcp__*'

export const CLAUDE_ARGS = [
  '-p',
  '--output-format', 'json',
  '--tools', '', // wyłącza WSZYSTKIE wbudowane narzędzia (kontrola główna)
  '--disallowedTools', DISALLOWED_TOOLS,
  '--strict-mcp-config', // ignoruje serwery MCP skonfigurowane u użytkownika
  '--setting-sources', '', // bez ustawień user/project/local → bez hooków, wtyczek, skilli, pamięci
  '--disable-slash-commands',
  '--no-session-persistence', // sesje czatu nie trafiają do historii Claude Code
  '--system-prompt', SYSTEM_PROMPT, // zastępuje domyślny prompt agenta (stały tekst, bez danych użytkownika)
  // Bez '--bare': w tym trybie CLI nie używa logowania OAuth (tylko ANTHROPIC_API_KEY)
  // i zwraca „Not logged in”.
]

const MAX_STDOUT_BYTES = 1024 * 1024
/** Ile czekamy na `close` po zabiciu procesu, zanim i tak sprzątniemy katalog. */
const CLEANUP_GRACE_MS = 5000

/** Środowisko procesu bez sekretów workera. */
function childEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^SUPABASE_|^NEXT_PUBLIC_SUPABASE_/i.test(key)) delete env[key]
  }
  return env
}

/**
 * Zabija proces wraz z potomkami. Na Windows `child.kill()` kończy tylko claude.exe,
 * a jego procesy potomne trzymałyby katalog tymczasowy (EBUSY) — stąd `taskkill /T /F`.
 * @param {{ pid?: number, kill: () => unknown }} child
 */
export function killTree(child) {
  if (process.platform === 'win32' && child.pid) {
    try {
      const tk = spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { shell: false, windowsHide: true, stdio: 'ignore' })
      tk.on('error', () => {})
    } catch {
      // brak taskkill — zostaje child.kill() poniżej
    }
  }
  try {
    child.kill()
  } catch {
    // proces mógł już się zakończyć
  }
}

/**
 * @param {string} prompt
 * @param {{ timeoutMs?: number, spawnFn?: typeof spawn, bin?: string, killFn?: typeof killTree }} [options]
 * @returns {Promise<string>}
 */
export function runClaude(prompt, { timeoutMs = 60000, spawnFn = spawn, bin, killFn = killTree } = {}) {
  const exe = bin || process.env.CLAUDE_BIN || 'claude'
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'ekotaxi-'))
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      rmSync(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    } catch {
      // katalog tymczasowy — brak usunięcia nie jest krytyczny
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer

    const settle = (/** @type {Error | null} */ err, /** @type {string} */ value = '') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(value)
    }

    /** Zabija proces; katalog sprzątamy po `close` (albo po CLEANUP_GRACE_MS). */
    const abort = (/** @type {Error} */ err) => {
      killFn(child)
      setTimeout(cleanup, CLEANUP_GRACE_MS).unref?.()
      settle(err)
    }

    /** @type {any} */
    let child
    try {
      child = spawnFn(exe, CLAUDE_ARGS, {
        cwd,
        shell: false,
        windowsHide: true,
        env: childEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      cleanup()
      settle(e instanceof Error ? e : new Error(String(e)))
      return
    }

    timer = setTimeout(() => abort(new Error(`claude: timeout po ${timeoutMs} ms`)), timeoutMs)

    child.on('error', (/** @type {Error} */ e) => {
      cleanup()
      settle(new Error(`claude: nie udało się uruchomić (${e.message})`))
    })

    child.stdout.on('data', (/** @type {Buffer} */ d) => {
      if (settled) return
      size += d.length
      if (size > MAX_STDOUT_BYTES) {
        abort(new Error('claude: za duża odpowiedź'))
        return
      }
      chunks.push(Buffer.from(d))
    })
    child.stderr?.on('data', () => {}) // stderr ignorujemy (nie logujemy treści)

    child.on('close', (/** @type {number | null} */ code) => {
      cleanup() // proces zakończony — katalog nie jest już zajęty
      if (code !== 0) {
        settle(new Error(`claude: kod wyjścia ${code}`))
        return
      }
      let parsed
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        settle(new Error('claude: nieprawidłowy JSON na wyjściu'))
        return
      }
      if (!parsed || parsed.is_error === true || typeof parsed.result !== 'string') {
        settle(new Error('claude: odpowiedź z błędem'))
        return
      }
      settle(null, parsed.result)
    })

    child.stdin.on?.('error', () => {}) // EPIPE, gdy proces padnie przed odczytem
    child.stdin.end(prompt)
  })
}
