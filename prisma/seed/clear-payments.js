const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const result = await prisma.payment.deleteMany();
  console.log(`✅ ${result.count} paiements supprimés`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
