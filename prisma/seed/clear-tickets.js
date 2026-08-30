const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const result = await prisma.queueTicket.deleteMany();
  console.log(`✅ ${result.count} tickets supprimés`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
