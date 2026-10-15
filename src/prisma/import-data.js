const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set in environment!');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function parseDate(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseBool(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function parseIntVal(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Math.floor(val);
  const n = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseFloatVal(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function parseJson(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    if (typeof val === 'string' && val.includes(',')) {
      return val.split(',').map((s) => s.trim());
    }
    return val;
  }
}

function parseStringArray(val) {
  if (val === null || val === undefined || val === '') return [];
  if (Array.isArray(val)) return val.map(String);
  const parsed = parseJson(val);
  if (Array.isArray(parsed)) return parsed.map(String);
  if (typeof parsed === 'string') return [parsed];
  return [];
}

async function insertOrUpdate(client, tableName, record, pkey = 'id') {
  const keys = Object.keys(record);
  const values = Object.values(record);

  const columnNames = keys.map((k) => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const updateClause = keys
    .filter((k) => k !== pkey)
    .map((k) => `"${k}" = EXCLUDED."${k}"`)
    .join(', ');

  const query = `
    INSERT INTO "${tableName}" (${columnNames})
    VALUES (${placeholders})
    ON CONFLICT ("${pkey}") DO UPDATE
    SET ${updateClause}
    RETURNING "${pkey}";
  `;

  const res = await client.query(query, values);
  return res.rows[0][pkey];
}

async function resetSequence(client, tableName, pkey = 'id') {
  try {
    const seqRes = await client.query(`SELECT pg_get_serial_sequence('"${tableName}"', '${pkey}') as seq;`);
    const seqName = seqRes.rows[0]?.seq;
    if (seqName) {
      await client.query(`SELECT setval('${seqName}', COALESCE((SELECT MAX("${pkey}") FROM "${tableName}"), 1), true);`);
      console.log(`  🔄 Sequence '${seqName}' updated to MAX("${pkey}").`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Could not reset sequence for table '${tableName}':`, err.message);
  }
}

async function importUsers(client, dataDir) {
  const file = path.join(dataDir, 'User_10.xlsx');
  if (!fs.existsSync(file)) {
    console.log('Skipping User_10.xlsx (file not found)');
    return 0;
  }

  const workbook = XLSX.readFile(file, { cellDates: true, raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
  console.log(`\n📥 Importing Users from User_10.xlsx (${rows.length} rows)...`);

  let count = 0;
  for (const row of rows) {
    if (row.id === null || row.id === undefined) continue;

    const userRecord = {
      id: parseIntVal(row.id),
      mobile: row.mobile ? String(row.mobile).trim() : '',
      createdAt: parseDate(row.createdAt) || new Date(),
      email: row.email ? String(row.email).trim() : null,
      isProfileComplete: parseBool(row.isProfileComplete) ?? true,
      name: row.name ? String(row.name).trim() : null,
      area: row.area ? String(row.area).trim() : null,
      city: row.city ? String(row.city).trim() : null,
      latitude: parseFloatVal(row.latitude),
      locality: row.locality ? String(row.locality).trim() : null,
      longitude: parseFloatVal(row.longitude),
    };

    try {
      await insertOrUpdate(client, 'User', userRecord, 'id');
      count++;
    } catch (err) {
      if (err.message.includes('User_mobile_key')) {
        // If mobile key conflicts with an existing different ID, update mobile or user ID
        const altQuery = `
          INSERT INTO "User" ("id", "mobile", "createdAt", "email", "isProfileComplete", "name", "area", "city", "latitude", "locality", "longitude")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT ("mobile") DO UPDATE
          SET "id" = EXCLUDED."id", "name" = EXCLUDED."name", "email" = EXCLUDED."email", "city" = EXCLUDED."city", "locality" = EXCLUDED."locality"
          RETURNING "id";
        `;
        await client.query(altQuery, [
          userRecord.id,
          userRecord.mobile,
          userRecord.createdAt,
          userRecord.email,
          userRecord.isProfileComplete,
          userRecord.name,
          userRecord.area,
          userRecord.city,
          userRecord.latitude,
          userRecord.locality,
          userRecord.longitude,
        ]);
        count++;
      } else {
        console.error(`❌ Error importing User ID ${row.id}:`, err.message);
      }
    }
  }

  await resetSequence(client, 'User');
  console.log(`✅ Successfully imported ${count} Users.`);
  return count;
}

async function importPGDetails(client, dataDir) {
  const file = path.join(dataDir, 'Property_10.xlsx');
  if (!fs.existsSync(file)) {
    console.log('Skipping Property_10.xlsx (file not found)');
    return 0;
  }

  const workbook = XLSX.readFile(file, { cellDates: true, raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
  console.log(`\n📥 Importing Property/PGDetails from Property_10.xlsx (${rows.length} rows)...`);

  let count = 0;
  for (const row of rows) {
    if (row.id === null || row.id === undefined || !row.userId) continue;

    const pgRecord = {
      id: parseIntVal(row.id),
      userId: parseIntVal(row.userId),
      city: row.city ? String(row.city).trim() : 'Chennai',
      locality: row.locality ? String(row.locality).trim() : '',
      street: row.street ? String(row.street).trim() : null,
      landmark: row.landmark ? String(row.landmark).trim() : null,
      latitude: parseFloatVal(row.latitude),
      longitude: parseFloatVal(row.longitude),
      propertyName: row.propertyName ? String(row.propertyName).trim() : null,
      propertyType: row.propertyType ? String(row.propertyType).trim() : 'PG',
      roomType: JSON.stringify(parseJson(row.roomType)),
      foodIncluded: parseBool(row.foodIncluded),
      foodType: JSON.stringify(parseJson(row.foodType)),
      pgAmenities: JSON.stringify(parseJson(row.pgAmenities)),
      parking: row.parking ? String(row.parking).trim() : null,
      availableFrom: parseDate(row.availableFrom),
      noticePeriod: parseIntVal(row.noticePeriod),
      gateClosingTime: parseDate(row.gateClosingTime),
      images: parseStringArray(row.images),
      video: row.video ? String(row.video).trim() : null,
      contactName: row.contactName ? String(row.contactName).trim() : null,
      mobileNo: row.mobileNo ? String(row.mobileNo).trim() : null,
      whatsapp: parseBool(row.whatsapp),
      whatsappupdates: parseBool(row.whatsappupdates),
      preferredTenant: JSON.stringify(parseJson(row.preferredTenant)),
      preferredGuests: JSON.stringify(parseJson(row.preferredGuests)),
      restrictions: JSON.stringify(parseJson(row.restrictions)),
      propertyDescription: row.propertyDescription ? String(row.propertyDescription).trim() : null,
      currentStep: parseIntVal(row.currentStep) ?? 1,
      isDraft: parseBool(row.isDraft) ?? false,
      isDeleted: parseBool(row.isDeleted) ?? false,
      createdAt: parseDate(row.createdAt) || new Date(),
      updatedAt: parseDate(row.updatedAt) || new Date(),
      viewscount: parseIntVal(row.viewscount) ?? 0,
      propertyType2: row.propertyType2 ? String(row.propertyType2).trim() : null,
      availabilityDay: JSON.stringify(parseJson(row.availabilityDay)),
      availableAllDay: parseBool(row.availableAllDay),
      endTime: row.endTime ? String(row.endTime).trim() : null,
      startTime: row.startTime ? String(row.startTime).trim() : null,
      isSoldOut: parseBool(row.isSoldOut) ?? false,
      soldOutAt: parseDate(row.soldOutAt),
      soldOutReason: row.soldOutReason ? String(row.soldOutReason).trim() : null,
    };

    try {
      await insertOrUpdate(client, 'Property', pgRecord, 'id');
      count++;
    } catch (err) {
      console.error(`❌ Error importing Property ID ${row.id}:`, err.message);
    }
  }

  await resetSequence(client, 'Property');
  console.log(`✅ Successfully imported ${count} PG/Property details.`);
  return count;
}

async function importApartments(client, dataDir) {
  const file = path.join(dataDir, 'Apartment_10.xlsx');
  if (!fs.existsSync(file)) {
    console.log('Skipping Apartment_10.xlsx (file not found)');
    return 0;
  }

  const workbook = XLSX.readFile(file, { cellDates: true, raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
  console.log(`\n📥 Importing Apartments from Apartment_10.xlsx (${rows.length} rows)...`);

  let count = 0;
  for (const row of rows) {
    if (row.id === null || row.id === undefined || !row.userId) continue;

    const apartmentRecord = {
      id: parseIntVal(row.id),
      userId: parseIntVal(row.userId),
      city: row.city ? String(row.city).trim() : 'Chennai',
      locality: row.locality ? String(row.locality).trim() : '',
      street: row.street ? String(row.street).trim() : null,
      landmark: row.landmark ? String(row.landmark).trim() : null,
      latitude: parseFloatVal(row.latitude),
      longitude: parseFloatVal(row.longitude),
      buildingType: row.buildingType ? String(row.buildingType).trim() : null,
      bhkType: row.bhkType ? String(row.bhkType).trim() : null,
      floor: parseIntVal(row.floor),
      totalFloor: parseIntVal(row.totalFloor),
      builtUpArea: parseIntVal(row.builtUpArea),
      propertyAge: row.propertyAge ? String(row.propertyAge).trim() : null,
      facing: row.facing ? String(row.facing).trim() : null,
      createdAt: parseDate(row.createdAt) || new Date(),
      updatedAt: parseDate(row.updatedAt) || new Date(),
      propertyType2: row.propertyType2 ? String(row.propertyType2).trim() : null,
      otherFeatures: JSON.stringify(parseJson(row.otherFeatures)),
      furnishing: row.furnishing ? String(row.furnishing).trim() : null,
      rentType: row.rentType ? String(row.rentType).trim() : null,
      apartmentType: row.apartmentType ? String(row.apartmentType).trim() : null,
      availableFrom: row.availableFrom ? String(row.availableFrom).trim() : null,
      description: row.description ? String(row.description).trim() : null,
      maintenance: row.maintenance ? String(row.maintenance).trim() : null,
      parking: row.parking ? String(row.parking).trim() : null,
      rentNegotiable: parseBool(row.rentNegotiable),
      expectedRent: parseIntVal(row.expectedRent),
      deposit: parseIntVal(row.deposit),
      maintenanceAmount: parseIntVal(row.maintenanceAmount),
      preferredTenant: parseStringArray(row.preferredTenant),
      amenities: parseStringArray(row.amenities),
      bathroom: parseIntVal(row.bathroom),
      directions: row.directions ? String(row.directions).trim() : null,
      gateSecurity: parseBool(row.gateSecurity),
      gymAllowed: parseBool(row.gymAllowed),
      noOfBalcony: parseIntVal(row.noOfBalcony),
      nonVegAllowed: parseBool(row.nonVegAllowed),
      petAllowed: parseBool(row.petAllowed),
      propertyCondition: JSON.stringify(parseJson(row.propertyCondition)),
      secondaryNumber: row.secondaryNumber ? String(row.secondaryNumber).trim() : null,
      shownBy: row.shownBy ? String(row.shownBy).trim() : null,
      unitsPropertiesAvailable: parseBool(row.unitsPropertiesAvailable),
      waterSupply: JSON.stringify(parseJson(row.waterSupply)),
      availabilityDay: JSON.stringify(parseJson(row.availabilityDay)),
      images: parseStringArray(row.images),
      video: row.video ? String(row.video).trim() : null,
      availableAllDay: parseBool(row.availableAllDay),
      endTime: row.endTime ? String(row.endTime).trim() : null,
      startTime: row.startTime ? String(row.startTime).trim() : null,
      viewscount: parseIntVal(row.viewscount) ?? 0,
      isSoldOut: parseBool(row.isSoldOut) ?? false,
      soldOutAt: parseDate(row.soldOutAt),
      soldOutReason: row.soldOutReason ? String(row.soldOutReason).trim() : null,
    };

    try {
      await insertOrUpdate(client, 'Apartment', apartmentRecord, 'id');
      count++;
    } catch (err) {
      console.error(`❌ Error importing Apartment ID ${row.id}:`, err.message);
    }
  }

  await resetSequence(client, 'Apartment');
  console.log(`✅ Successfully imported ${count} Apartments.`);
  return count;
}

async function importCommercials(client, dataDir) {
  const file = path.join(dataDir, 'Commercial_10.xlsx');
  if (!fs.existsSync(file)) {
    console.log('Skipping Commercial_10.xlsx (file not found)');
    return 0;
  }

  const workbook = XLSX.readFile(file, { cellDates: true, raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
  console.log(`\n📥 Importing Commercial properties from Commercial_10.xlsx (${rows.length} rows)...`);

  let count = 0;
  for (const row of rows) {
    if (row.id === null || row.id === undefined || !row.userId) continue;

    const commercialRecord = {
      id: parseIntVal(row.id),
      userId: parseIntVal(row.userId),
      city: row.city ? String(row.city).trim() : 'Chennai',
      locality: row.locality ? String(row.locality).trim() : null,
      street: row.street ? String(row.street).trim() : null,
      landmark: row.landmark ? String(row.landmark).trim() : null,
      latitude: parseFloatVal(row.latitude),
      longitude: parseFloatVal(row.longitude),
      propertyType: row.propertyType ? String(row.propertyType).trim() : null,
      buildingType: row.buildingType ? String(row.buildingType).trim() : null,
      propertyAge: row.propertyAge ? String(row.propertyAge).trim() : null,
      floor: parseIntVal(row.floor),
      totalFloor: parseIntVal(row.totalFloor),
      builtUpArea: parseIntVal(row.builtUpArea),
      furnishing: JSON.stringify(parseJson(row.furnishing)),
      otherFeatures: JSON.stringify(parseJson(row.otherFeatures)),
      rentType: row.rentType ? String(row.rentType).trim() : null,
      expectedRent: parseIntVal(row.expectedRent),
      deposit: parseIntVal(row.deposit),
      maintenanceAmount: parseIntVal(row.maintenanceAmount),
      maintenance: row.maintenance ? String(row.maintenance).trim() : null,
      rentNegotiable: parseBool(row.rentNegotiable),
      depositNegotiable: parseBool(row.depositNegotiable),
      maintenanceExtra: parseBool(row.maintenanceExtra),
      leaseDuration: row.leaseDuration ? String(row.leaseDuration).trim() : null,
      lockinPeriod: row.lockinPeriod ? String(row.lockinPeriod).trim() : null,
      availableFrom: row.availableFrom ? String(row.availableFrom).trim() : null,
      idealFor: JSON.stringify(parseJson(row.idealFor)),
      addOthertags: row.addOthertags ? String(row.addOthertags).trim() : null,
      contactName: row.contactName ? String(row.contactName).trim() : null,
      mobileNo: row.mobileNo ? String(row.mobileNo).trim() : null,
      whatsapp: parseBool(row.whatsapp),
      images: parseStringArray(row.images),
      video: row.video ? String(row.video).trim() : null,
      description: row.description ? String(row.description).trim() : null,
      availabilityDay: JSON.stringify(parseJson(row.availabilityDay)),
      startTime: row.startTime ? String(row.startTime).trim() : null,
      endTime: row.endTime ? String(row.endTime).trim() : null,
      availableAllDay: parseBool(row.availableAllDay),
      currentStep: parseIntVal(row.currentStep) ?? 1,
      isDraft: parseBool(row.isDraft) ?? false,
      createdAt: parseDate(row.createdAt) || new Date(),
      commercialPropertyType: row.commercialPropertyType ? String(row.commercialPropertyType).trim() : null,
      commercialOtherFeatures: JSON.stringify(parseJson(row.commercialOtherFeatures)),
      slots: row.slots ? String(row.slots).trim() : null,
      viewscount: parseIntVal(row.viewscount) ?? 0,
      isSoldOut: parseBool(row.isSoldOut) ?? false,
      soldOutAt: parseDate(row.soldOutAt),
      soldOutReason: row.soldOutReason ? String(row.soldOutReason).trim() : null,
    };

    try {
      await insertOrUpdate(client, 'Commercial', commercialRecord, 'id');
      count++;
    } catch (err) {
      console.error(`❌ Error importing Commercial ID ${row.id}:`, err.message);
    }
  }

  await resetSequence(client, 'Commercial');
  console.log(`✅ Successfully imported ${count} Commercial properties.`);
  return count;
}

async function main() {
  const dataDir = path.join(__dirname, '..', 'dataimport');
  console.log('🚀 Starting Data Import into Database...');
  console.log('Data Directory:', dataDir);

  const client = await pool.connect();
  try {
    const usersCount = await importUsers(client, dataDir);
    const pgCount = await importPGDetails(client, dataDir);
    const apartmentCount = await importApartments(client, dataDir);
    const commercialCount = await importCommercials(client, dataDir);

    console.log('\n========================================');
    console.log('🎉 DATA IMPORT COMPLETED SUMMARY:');
    console.log(`- Users: ${usersCount}`);
    console.log(`- PG/Property Details: ${pgCount}`);
    console.log(`- Apartments: ${apartmentCount}`);
    console.log(`- Commercials: ${commercialCount}`);
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ Data Import Failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
