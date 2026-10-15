const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verify() {
  console.log('🔍 VERIFYING IMPORTED DATA IN DATABASE:\n');

  const usersCount = await pool.query('SELECT COUNT(*) FROM "User";');
  const userList = await pool.query('SELECT id, name, mobile, city FROM "User" WHERE id >= 38 ORDER BY id;');
  console.log(`👤 Users Total in DB: ${usersCount.rows[0].count}`);
  console.table(userList.rows);

  const pgCount = await pool.query('SELECT COUNT(*) FROM "Property";');
  const pgList = await pool.query('SELECT id, "userId", "propertyName", "propertyType", city FROM "Property" WHERE id >= 206 ORDER BY id;');
  console.log(`\n🏢 PG/Property Details Total in DB: ${pgCount.rows[0].count}`);
  console.table(pgList.rows);

  const aptCount = await pool.query('SELECT COUNT(*) FROM "Apartment";');
  const aptList = await pool.query('SELECT id, "userId", "buildingType", "bhkType", city FROM "Apartment" WHERE id >= 74 ORDER BY id;');
  console.log(`\n🏠 Apartments Total in DB: ${aptCount.rows[0].count}`);
  console.table(aptList.rows);

  const commCount = await pool.query('SELECT COUNT(*) FROM "Commercial";');
  const commList = await pool.query('SELECT id, "userId", "propertyType", "expectedRent", city FROM "Commercial" WHERE id >= 65 ORDER BY id;');
  console.log(`\n🏬 Commercials Total in DB: ${commCount.rows[0].count}`);
  console.table(commList.rows);

  await pool.end();
}

verify();
