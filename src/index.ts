import 'dotenv/config'
import express, { Request, Response } from 'express'
import cron from 'node-cron'
import { checkWorkingOnStatsDb, conf } from './conf'
import { emptyAndRefillStatsDb } from './core'
import { buildInfo, health } from './health'

const appName = 'StatsRefill'

async function startServer() {
  const app = express()
  // Health check, returns the deployed version
  app.get('/', (_, res: Response) => {
    res.json(health())
  })
  app.post('/launch', async (req: Request, res: Response) => {
    const authorizationHeader = req.headers.authorization ?? ''
    if (authorizationHeader === `Bearer ${conf.apiKey}`) {
      res.json({ message: 'Recreation of stats DB launched in the background' })
      emptyAndRefillStatsDb()
    } else {
      res.status(401).json({ message: 'Missing or incorrect authentication' })
    }
  })
  app.listen(conf.port, () => {
    console.log(
      `${appName} app v${buildInfo.version} (${buildInfo.gitCommit}) is running on port ${conf.port}`,
    )
  })
}

async function start() {
  console.log(`~~ Starting ${appName} app ~~`)
  checkWorkingOnStatsDb()

  console.log('Scheduling cron with pattern', conf.cronPattern)
  cron.schedule(conf.cronPattern, () => {
    console.log('Launching scheduled task')
    emptyAndRefillStatsDb()
  })

  startServer()
}

start()
