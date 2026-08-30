const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  const companies = await prisma.company.findMany();
  console.log('=== Sociétés ===');
  for (const c of companies) {
    const pay = await prisma.payment.findMany({ where: { companyId: c.id } });
    console.log(`${c.name} (id:${c.id}) — paiements: ${pay.length}`);
  }

  const payments = await prisma.payment.findMany();
  console.log(`\n=== Total paiements: ${payments.length} ===`);
  if (payments.length === 0) {
    console.log('⚠️  Aucun paiement → toutes les sociétés/agents sont bloqués après le 5 du mois.');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
