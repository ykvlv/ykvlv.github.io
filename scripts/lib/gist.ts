/**
 * Reads and writes individual files inside one GitHub Gist.
 */

import { GITHUB_API_BASE, githubHeaders } from './github.ts'

interface Gist {
  /** The parsed file, or `undefined` while the Gist holds no such file yet. */
  read<T>(filename: string): Promise<T | undefined>
  write(filename: string, data: unknown): Promise<void>
}

export function openGist(id: string, token: string): Gist {
  const headers = githubHeaders(token)
  const url = `${GITHUB_API_BASE}/gists/${id}`

  return {
    async read<T>(filename: string): Promise<T | undefined> {
      const response = await fetch(url, { headers })
      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} - ${await response.text()}`,
        )
      }

      const gist = (await response.json()) as {
        files: Record<string, { content: string } | undefined>
      }
      const file = gist.files[filename]
      return file ? (JSON.parse(file.content) as T) : undefined
    },

    async write(filename, data) {
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          files: { [filename]: { content: JSON.stringify(data, null, 2) } },
        }),
      })
      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} - ${await response.text()}`,
        )
      }
    },
  }
}
