/**
 * The base url and headers every GitHub call shares.
 */

export const GITHUB_API_BASE = 'https://api.github.com'

export function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}
