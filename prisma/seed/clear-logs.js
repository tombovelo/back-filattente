const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const result = await prisma.eventLog.deleteMany();
  console.log(`✅ ${result.count} journaux supprimés`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
