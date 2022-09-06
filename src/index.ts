import { anonymizationFunctionsSql } from './anonymizationRules'
import {
  doExportImport,
  doExportImportAndAnonymization,
  generateAnonymizationSqlForAllTables,
} from './core'
import { createPool, readFromEnv, runSqlsSequentially } from './utils'
import express, { Request, Response } from 'express'
// Notes et caveats
//
// - le dump/restore crache plein d'erreurs liées aux permissions/users.
// C'est compliqué de comprendre pourquoi, j'ai choisi de juste les ignorer.
// Les tables et leurs contenus sont bien importés
//
// - le dump/restore n'efface pas la db anon existante. Il écrase juste les tables existant déjà
// Si quelqu'un crée une table, ou une fonction, etc. sur la db anon, elle restera là
// On pourrait essayer de faire un vrai si besoin.
//
// - la fonction d'anonymisation fait juste un hash MD5 de certains champs

const sourceDbUrl = readFromEnv('SOURCE_DB_MAIN_URL')
const anonDbUrl = readFromEnv('ANON_DB_MAIN_URL')
const port = process.env.PORT
const apiKey = process.env.API_KEY

// This is only a tiny part of the name, it should be safe to commit
const partOfAnonDbName = 'byk8h'

function checkWorkingOnAnonDb() {
  // an accidental misconfiguration could easily happen and rewrite the wrong database
  if (!anonDbUrl.includes(partOfAnonDbName)) {
    throw new Error(
      "The provided anon db URL (the one we will overwrite) doesn't look like the one we expect. Be careful, you could overwrite a production database !",
    )
  }
}

async function startServer() {
  const app = express()

  app.get('/', (_, res: Response) => {
    res.json({ message: 'Hello anonymization app' })
  })

  app.post('/', async (req: Request, res: Response) => {
    const authorizationHeader = req.headers.authorization ?? ''
    if (authorizationHeader === `Bearer ${apiKey}`) {
      await doExportImportAndAnonymization({ sourceDbUrl, anonDbUrl })
      res.json({ message: 'Import/export and anonymization done' })
    } else {
      res
        .sendStatus(401)
        .json({ message: 'Missing or incorrect authentication' })
    }
  })

  app.listen(port, () => {
    console.log(`Anonymization app is running on port ${port}`)
  })
}

async function start() {
  checkWorkingOnAnonDb()
  startServer()
}

start()
