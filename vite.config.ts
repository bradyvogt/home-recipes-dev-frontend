import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const isGitHubActionsBuild = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  plugins: [react()],
  base: isGitHubActionsBuild && repoName ? `/${repoName}/` : '/',
})
