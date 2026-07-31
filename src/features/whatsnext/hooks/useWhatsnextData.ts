import { useGistData } from '@/shared'
import type { WhatsnextData } from '../types'

const { GIST_FILENAME_WHATSNEXT } = import.meta.env

export const useWhatsnextData = () =>
  useGistData<WhatsnextData>(GIST_FILENAME_WHATSNEXT)
