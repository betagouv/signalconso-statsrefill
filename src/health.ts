import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface Health {
  name: string
  version: string
  gitCommit: string
  startTime: string
}

type BuildInfo = Omit<Health, 'name'>

function readVersion(): string {
  try {
    const packageJson = readFileSync(
      join(__dirname, '..', 'package.json'),
      'utf-8',
    )
    return JSON.parse(packageJson).version ?? 'unknown'
  } catch {
    console.warn('[health]: Unable to read version from package.json')
    return 'unknown'
  }
}

// Same logic as the BuildInfoPlugin of the Scala projects : COMMIT_ID, else `git rev-parse HEAD`, else "unknown"
function readGitCommit(): string {
  const commitId = process.env['COMMIT_ID']
  if (commitId) {
    return commitId
  }
  try {
    return (
      execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || 'unknown'
    )
  } catch {
    return 'unknown'
  }
}

// No build step here (the app runs with ts-node), so the info is computed once at startup
export const buildInfo: BuildInfo = {
  version: readVersion(),
  gitCommit: readGitCommit(),
  startTime: new Date().toISOString(),
}

export function health(): Health {
  return { name: 'signalconso-statsrefill', ...buildInfo }
}
