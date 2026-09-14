const { Client } = require("pg");

const sql = `
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS egress_id TEXT;

CREATE TABLE IF NOT EXISTS recordings (
  id BIGSERIAL PRIMARY KEY,
  room_name TEXT NOT NULL,
  egress_id TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recording',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recordings_egress_id_idx ON recordings (egress_id);

ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service writes" ON recordings;
CREATE POLICY "service writes" ON recordings
  FOR ALL USING (true) WITH CHECK (true);
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration 7 applied successfully.");

    const { rows: r1 } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='rooms' AND column_name='egress_id'`
    );
    console.log("rooms.egress_id column:", r1.length > 0 ? "OK" : "MISSING");

    const { rows: r2 } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name='recordings'`
    );
    console.log("recordings table:", r2.length > 0 ? "OK" : "MISSING");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
