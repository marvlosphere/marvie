const { Client } = require("pg");

const sql = `
drop policy if exists "poll_votes_update" on poll_votes;
create policy "poll_votes_update" on poll_votes for update using (true);
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration 4 applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
