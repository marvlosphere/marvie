const { Client } = require("pg");

const sql = `
alter table rooms add column if not exists last_active_at timestamptz not null default now();
create index if not exists rooms_last_active_idx on rooms(last_active_at);
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration 5 applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
