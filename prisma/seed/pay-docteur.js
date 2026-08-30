const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  const company = await prisma.company.findFirst({ where: { name: 'Docteur' } });
  if (!company) { console.error('Société "Docteur" introuvable'); process.exit(1); }

  const superadmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!superadmin) { console.error('Superadmin introuvable'); process.exit(1); }

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const existing = await prisma.payment.findFirst({ where: { companyId: company.id, periodMonth } });
  if (existing) {
    console.log(`Paiement société ${periodMonth} déjà enregistré pour ${company.name}`);
  } else {
    await prisma.payment.create({
      data: {
        companyId: company.id,
        scope: 'BY_COMPANY',
        amount: 50000,
        periodMonth,
        recordedById: superadmin.id,
      },
    });
    console.log(`✅ Paiement société enregistré pour ${company.name} (${periodMonth})`);
  }

  const agents = await prisma.user.findMany({ where: { companyId: company.id, role: 'AGENT' } });
  for (const agent of agents) {
    const existingAgent = await prisma.payment.findFirst({ where: { agentId: agent.id, periodMonth } });
    if (existingAgent) {
      console.log(`Paiement agent ${agent.username} ${periodMonth} déjà enregistré`);
    } else {
      await prisma.payment.create({
        data: {
          companyId: company.id,
          agentId: agent.id,
          scope: 'BY_AGENT',
          amount: 25000,
          periodMonth,
          recordedById: superadmin.id,
        },
      });
      console.log(`✅ Paiement agent enregistré pour ${agent.username} (${periodMonth})`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
