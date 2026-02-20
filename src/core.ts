import { Kysely } from 'kysely'
import { conf } from './conf'
import { Schema, statsDbResetSqls } from './schema'
import { md5, startConnectionPool } from './utils'

export async function emptyAndRefillStatsDb() {
  try {
    const source = startConnectionPool('source_db')
    const stats = startConnectionPool('stats_db')
    await resetStatsDb({ stats })
    await processCompanyAccesses({ source, stats })
    await processCompanies({ source, stats })
    await processReports({ source, stats })
    await processEvents({ source, stats })
    source.destroy()
    stats.destroy()
  } catch (err) {
    console.error('Stats DB emptying+refill failed', err)
  }
}

async function resetStatsDb({ stats }: { stats: Kysely<Schema> }) {
  for (const sqlQuery of statsDbResetSqls) {
    console.log('Running', sqlQuery)
    await sqlQuery.execute(stats)
  }
}

async function processReports({
  source,
  stats,
}: {
  source: Kysely<Schema>
  stats: Kysely<Schema>
}) {
  const table = 'reports'
  await copyTableByBatches(table, {
    query: (offset, limit) =>
      source
        .selectFrom(table)
        .select([
          'id',
          'creation_date',
          'status',
          'category',
          'tags',
          'company_id',
          'company_name',
        ])
        .orderBy('id')
        .offset(offset)
        .limit(limit)
        .execute(),
    transform: (row) => ({
      ...row,
      company_name: row.company_name
        ? `anon_${md5(row.company_name)}`
        : undefined,
    }),
    insert: (rows) => stats.insertInto(table).values(rows).execute(),
  })
}

async function processCompanyAccesses({
  source,
  stats,
}: {
  source: Kysely<Schema>
  stats: Kysely<Schema>
}) {
  const table = 'company_accesses'
  await copyTableByBatches(table, {
    query: (offset, limit) =>
      source
        .selectFrom(table)
        .select(['company_id', 'user_id'])
        .orderBy(['company_id', 'user_id'])
        .offset(offset)
        .limit(limit)
        .execute(),
    transform: (r) => r,
    insert: (rows) => stats.insertInto(table).values(rows).execute(),
  })
}

async function processCompanies({
  source,
  stats,
}: {
  source: Kysely<Schema>
  stats: Kysely<Schema>
}) {
  const table = 'companies'
  await copyTableByBatches(table, {
    query: (offset, limit) =>
      source
        .selectFrom(table)
        .select(['id', 'department'])
        .orderBy('id')
        .offset(offset)
        .limit(limit)
        .execute(),
    transform: (r) => r,
    insert: (rows) => stats.insertInto(table).values(rows).execute(),
  })
}

async function processEvents({
  source,
  stats,
}: {
  source: Kysely<Schema>
  stats: Kysely<Schema>
}) {
  const table = 'events'
  await copyTableByBatches(table, {
    query: (offset, limit) =>
      source
        .selectFrom(table)
        .select(['id', 'creation_date', 'report_id', 'action'])
        // no need for all the other events
        .where('action', '=', 'Réponse du professionnel au signalement')
        .orderBy('id')
        .offset(offset)
        .limit(limit)
        .execute(),
    transform: (r) => r,
    insert: (rows) => stats.insertInto(table).values(rows).execute(),
  })
}

async function copyTableByBatches<RowRead, RowToInsert>(
  table: string,
  {
    query,
    transform,
    insert,
  }: {
    query: (offset: number, limit: number) => Promise<RowRead[]>
    transform: (r: RowRead) => RowToInsert
    insert: (rows: RowToInsert[]) => Promise<unknown>
  },
) {
  console.log(`Starting to copy table ${table}`)
  let offset = 0
  while (true) {
    // select a batch of rows from the source db
    const rows = await query(offset, conf.batchSize)
    if (rows.length === 0) {
      console.log(`Done with table ${table}`)
      break
    } else {
      console.log(`Processing ${rows.length} rows of table ${table} with current offset ${offset}`)
      // transform each row, if needed
      const rowsTransformed = rows.map(transform)
      // insert into the target db
      await insert(rowsTransformed)
      offset += conf.batchSize
    }
  }
}
