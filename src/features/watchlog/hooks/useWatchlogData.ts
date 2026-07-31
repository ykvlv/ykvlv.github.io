import { useGistData } from '@/shared'
import type { WatchlogData } from '../types'

const { GIST_FILENAME_WATCHLOG } = import.meta.env

export const useWatchlogData = () =>
  useGistData<WatchlogData>(GIST_FILENAME_WATCHLOG)
