import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  // Société de démo + guichets
  const company = await prisma.company.create({
    data: {
      name: 'Compagnie Test',
      serviceCounters: {
        create: [
          { name: 'Accueil', prefix: 'A' },
          { name: 'Caissier', prefix: 'C' },
          { name: 'Service Client', prefix: 'S' },
        ],
      },
    },
    include: { serviceCounters: true },
  });

  // SuperAdmin plateforme (companyId = null)
  const superadminExists = await prisma.user.findFirst({
    where: { username: 'superadmin', companyId: null },
  });
  if (!superadminExists) {
    await prisma.user.create({
      data: {
        companyId: null,
        role: Role.SUPER_ADMIN,
        username: 'superadmin',
        passwordHash: password,
      },
    });
  }

  // CompanyAdmin + agents
  await prisma.user.create({
    data: {
      companyId: company.id,
      role: Role.COMPANY_ADMIN,
      username: 'admin',
      passwordHash: password,
    },
  });

  for (const [i, counter] of company.serviceCounters.entries()) {
    await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.AGENT,
        username: `agent${i + 1}`,
        passwordHash: password,
        assignedCounterId: counter.id,
      },
    });
  }

  console.log('Seed terminé :');
  console.log('  Société   :', company.name, '(id =', company.id, ')');
  console.log('  SuperAdmin   : superadmin / password123');
  console.log('  CompanyAdmin  : admin / password123');
  for (const c of company.serviceCounters) {
    console.log(`  Guichet   : ${c.name} (id = ${c.id}, prefix = ${c.prefix})`);
  }
  console.log('  Agents    : agent1/agent2/agent3 (password123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
