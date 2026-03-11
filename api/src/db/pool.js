const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Without this handler, a failed DB connection emits an unhandled 'error' event
// that crashes the Node process silently (no stderr output).
pool.on('error', (err) => {
  console.error('pg pool error:', err.message);
});

module.exports = pool;
