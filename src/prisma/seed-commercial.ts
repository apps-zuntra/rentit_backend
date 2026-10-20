// prisma/seed-commercial.ts
// Commercial Property Seed Data (20 Realistic Listings)


import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const userId = 2;

const commercialData = [
  {
    city: 'Chennai',
    locality: 'T Nagar',
    street: 'North Usman Road',
    landmark: 'Near Saravana Stores',
    latitude: 13.0418,
    longitude: 80.2337,
    commercialPropertyType: 'Office Space',
    propertyType: 'Commercial',
    buildingType: 'IT Park',
    propertyAge: '3 Years',
    floor: 5,
    totalFloor: 10,
    builtUpArea: 1850,
    furnishing: { furnished: true, ac: true, workstations: 25, cabins: 3 },
    slots: '2 Covered Parking',
    otherFeatures: {
      powerBackup: true,
      lift: true,
      security: true,
      cafeteria: true,
    },
    commercialOtherFeatures: ['Reception Area', 'Conference Room'],
    rentType: 'Monthly',
    expectedRent: 185000,
    deposit: 1110000,
    maintenanceAmount: 15000,
    maintenance: 'Monthly',
    rentNegotiable: true,
    depositNegotiable: true,
    maintenanceExtra: true,
    leaseDuration: '3 Years',
    lockinPeriod: '12 Months',
    availableFrom: '2026-06-01',
    idealFor: { itCompany: true, startup: true },
    addOthertags: 'Premium office in prime location',
    contactName: 'Rajesh Kumar',
    mobileNo: '9876543210',
    whatsapp: true,
    images: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
      'https://images.unsplash.com/photo-1497215842964-222b430dc094',
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36',
    ],
    video: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
    description:
      'Fully furnished office space with conference room, reception and 24/7 security.',
    availabilityDay: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
    },
    startTime: '09:00 AM',
    endTime: '06:00 PM',
    availableAllDay: false,
    currentStep: 7,
    isDraft: false,
  },

  {
    city: 'Chennai',
    locality: 'Velachery',
    street: '100 Feet Bypass Road',
    landmark: 'Near Phoenix Mall',
    latitude: 12.9791,
    longitude: 80.2212,
    commercialPropertyType: 'Shop',
    propertyType: 'Commercial',
    buildingType: 'Standalone Building',
    propertyAge: '5 Years',
    floor: 0,
    totalFloor: 2,
    builtUpArea: 650,
    furnishing: { furnished: false },
    slots: 'Customer Parking',
    otherFeatures: {
      cctv: true,
      washroom: true,
      security: true,
    },
    commercialOtherFeatures: ['Main Road Facing'],
    rentType: 'Monthly',
    expectedRent: 75000,
    deposit: 450000,
    maintenanceAmount: 3000,
    maintenance: 'Monthly',
    rentNegotiable: true,
    depositNegotiable: true,
    maintenanceExtra: false,
    leaseDuration: '5 Years',
    lockinPeriod: '6 Months',
    availableFrom: '2026-06-15',
    idealFor: { retail: true, boutique: true },
    addOthertags: 'High footfall area',
    contactName: 'Suresh Babu',
    mobileNo: '9876543211',
    whatsapp: true,
    images: [
      'https://images.unsplash.com/photo-1517048676732-d65bc937f952',
      'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a',
    ],
    video: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
    description:
      'Road-facing retail shop suitable for clothing, pharmacy or showroom.',
    availabilityDay: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
    },
    startTime: '10:00 AM',
    endTime: '08:00 PM',
    availableAllDay: false,
    currentStep: 7,
    isDraft: false,
  },
];

// Generate 18 more realistic properties
const localities = [
  'Anna Nagar',
  'Nungambakkam',
  'Guindy',
  'Porur',
  'OMR',
  'Sholinganallur',
  'Perungudi',
  'Tambaram',
  'Pallavaram',
  'Chromepet',
  'Adyar',
  'Mylapore',
  'Vadapalani',
  'Kodambakkam',
  'Alandur',
  'Ambattur',
  'Mogappair',
  'Siruseri',
];

const types = [
  'Office Space',
  'Coworking Space',
  'Shop',
  'Showroom',
  'Warehouse',
  'Industrial Shed',
];

for (let i = 0; i < 18; i++) {
  const locality = localities[i];
  const type = types[i % types.length];

  commercialData.push({
    city: 'Chennai',
    locality,
    street: `${i + 10} Main Road`,
    landmark: `Near ${locality} Bus Stand`,
    latitude: 13.0 + i * 0.01,
    longitude: 80.2 + i * 0.01,
    commercialPropertyType: type,
    propertyType: 'Commercial',
    buildingType:
      type === 'Warehouse' || type === 'Industrial Shed'
        ? 'Industrial'
        : 'Commercial Complex',
    propertyAge: `${(i % 8) + 1} Years`,
    floor: type === 'Shop' ? 0 : (i % 6) + 1,
    totalFloor: 8,
    builtUpArea: 800 + i * 150,
    furnishing: {
      furnished: i % 2 === 0,
      ac: i % 3 === 0,
    },
    slots: `${(i % 5) + 1} Parking`,
    otherFeatures: {
      powerBackup: true,
      lift: true,
      security: true,
      cctv: true,
    },
    commercialOtherFeatures: ['Fire Safety', '24x7 Access'],
    rentType: 'Monthly',
    expectedRent: 40000 + i * 10000,
    deposit: (40000 + i * 10000) * 6,
    maintenanceAmount: 2000 + i * 500,
    maintenance: 'Monthly',
    rentNegotiable: true,
    depositNegotiable: true,
    maintenanceExtra: true,
    leaseDuration: '3 Years',
    lockinPeriod: '6 Months',
    availableFrom: '2026-06-01',
    idealFor: {
      startup: true,
      retail: type === 'Shop' || type === 'Showroom',
    },
    addOthertags: `${type} available in ${locality}`,
    contactName: `Owner ${i + 3}`,
    mobileNo: `98765432${(12 + i).toString().padStart(2, '0')}`,
    whatsapp: true,
    images: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
      'https://images.unsplash.com/photo-1497215842964-222b430dc094',
      'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a',
    ],
    video: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
    description: `${type} in ${locality}, Chennai with excellent connectivity and premium amenities.`,
    availabilityDay: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
    },
    startTime: '09:00 AM',
    endTime: '07:00 PM',
    availableAllDay: false,
    currentStep: 7,
    isDraft: false,
    userId,
  } as any);
}

async function main() {
  console.log('🌱 Seeding 20 commercial properties...');

  for (const property of commercialData) {
    await prisma.commercial.create({
      data: {
        userId,
        ...property,
      },
    });
  }

  console.log('✅ Successfully seeded 20 commercial properties');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });