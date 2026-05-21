import { ipcMain, app, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CORE_EXT_REPO = 'VoidenHQ/core-extensions'
const RELEASES_API = `https://api.github.com/repos/${CORE_EXT_REPO}/releases/latest`

interface PluginEntry {
  version: string
  name: string
  file: string
}

interface ReleaseManifest {
  generatedAt: string
  plugins: Record<string, PluginEntry>
}

function getCacheDir(): string {
  return path.join(app.getPath('userData'), 'core-extensions-cache')
}

async function readCachedManifest(): Promise<ReleaseManifest | null> {
  const manifestPath = path.join(getCacheDir(), 'manifest.json')
  try {
    const content = await fs.readFile(manifestPath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function fetchJson(url: string): Promise<any> {
  const response = await net.fetch(url, {
    headers: {
      'User-Agent': 'Voiden-App',
      'Accept': 'application/vnd.github+json',
    },
  })
  if (!response.ok) throw new Error(`GitHub API error ${response.status} for ${url}`)
  return response.json()
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const response = await net.fetch(url, {
    headers: { 'User-Agent': 'Voiden-App' },
  })
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}): ${url}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  await fs.writeFile(destPath, buffer)
}

export function registerCoreExtensionsIpcHandlers(): void {
  /**
   * Returns a map of { pluginId -> absoluteFilePath } for every core plugin that
   * has a cached (downloaded) bundle available. The plugin loader uses this to
   * prefer the updated bundle over the bundled-at-build-time version.
   */
  ipcMain.handle('coreExtensions:getCachedPlugins', async (): Promise<Record<string, string>> => {
    const cacheDir = getCacheDir()
    const cached = await readCachedManifest()
    if (!cached) return {}

    const result: Record<string, string> = {}
    for (const [pluginId, entry] of Object.entries(cached.plugins)) {
      const filePath = path.join(cacheDir, pluginId, `${entry.version}.js`)
      if (existsSync(filePath)) {
        result[pluginId] = filePath
      }
    }
    return result
  })

  /**
   * Checks GitHub for a newer core-extensions release, downloads only the plugins
   * whose version changed, and saves them to the user-data cache directory.
   *
   * Returns { updated: string[], upToDate: boolean }.
   * The caller shows a toast if updated.length > 0.
   */
  ipcMain.handle('coreExtensions:checkAndUpdate', async (): Promise<{
    updated: string[]
    upToDate: boolean
    error?: string
  }> => {
    try {
      const cacheDir = getCacheDir()
      await fs.mkdir(cacheDir, { recursive: true })

      // 1. Fetch latest release metadata from GitHub
      const release = await fetchJson(RELEASES_API)
      const assets: Array<{ name: string; browser_download_url: string }> = release.assets ?? []

      // 2. Download the manifest from this release
      const manifestAsset = assets.find(a => a.name === 'manifest.json')
      if (!manifestAsset) {
        throw new Error('Latest release has no manifest.json asset — has the CI run yet?')
      }

      const manifestResponse = await net.fetch(manifestAsset.browser_download_url, {
        headers: { 'User-Agent': 'Voiden-App' },
      })
      if (!manifestResponse.ok) {
        throw new Error(`Failed to download manifest.json (HTTP ${manifestResponse.status})`)
      }
      const remoteManifest: ReleaseManifest = await manifestResponse.json()

      // 3. Compare per-plugin versions against cached manifest
      const cachedManifest = await readCachedManifest()
      const updated: string[] = []

      for (const [pluginId, remoteEntry] of Object.entries(remoteManifest.plugins)) {
        const cachedVersion = cachedManifest?.plugins?.[pluginId]?.version
        if (cachedVersion === remoteEntry.version) continue

        // Version changed — download the new bundle
        const asset = assets.find(a => a.name === `${pluginId}.js`)
        if (!asset) {
          console.warn(`[CoreExtensions] No asset found for ${pluginId}.js in release — skipping`)
          continue
        }

        const destPath = path.join(cacheDir, pluginId, `${remoteEntry.version}.js`)
        await downloadToFile(asset.browser_download_url, destPath)
        updated.push(pluginId)
      }

      // 4. Persist the updated manifest so future launches know what is cached
      if (updated.length > 0) {
        await fs.writeFile(
          path.join(cacheDir, 'manifest.json'),
          JSON.stringify(remoteManifest, null, 2),
        )
      }

      return { updated, upToDate: updated.length === 0 }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[CoreExtensions] Update check failed:', message)
      return { updated: [], upToDate: true, error: message }
    }
  })
}
