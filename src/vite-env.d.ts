/// <reference types="vite/client" />

// Exposed via envPrefix in vite.config.ts, which also asserts they are set
interface ImportMetaEnv {
  readonly GIST_ID: string
  readonly GIST_FILENAME_WATCHLOG: string
}

declare module 'virtual:uno.css' {
  const css: string
  export default css
}
