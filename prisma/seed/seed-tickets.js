const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const companyName = args[0] || 'Docteur';
const agentName = args[1] || 'gildos';
const count = parseInt(args[2], 10) || 10;

async function main() {
  const prisma = new PrismaClient();

  const company = await prisma.company.findFirst({ where: { name: companyName } });
  if (!company) { console.error(`Société "${companyName}" introuvable`); process.exit(1); }

  const agent = await prisma.user.findFirst({ where: { companyId: company.id, username: agentName } });
  if (!agent) { console.error(`Agent "${agentName}" introuvable dans ${companyName}`); process.exit(1); }

  if (!agent.assignedCounterId) { console.error(`Agent "${agentName}" n'a pas de guichet assigné`); process.exit(1); }

  const counter = await prisma.serviceCounter.findFirst({ where: { id: agent.assignedCounterId } });
  if (!counter) { console.error('Guichet introuvable'); process.exit(1); }

  console.log(`Société: ${company.name} (id: ${company.id})`);
  console.log(`Agent: ${agent.username} (id: ${agent.id})`);
  console.log(`Guichet: ${counter.name} (prefix: ${counter.prefix}, seq actuel: ${counter.ticketCounter})`);

  const startSeq = counter.ticketCounter + 1;
  const tickets = [];
  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    tickets.push({
      companyId: company.id,
      counterId: counter.id,
      ticketNumber: `${counter.prefix}-${String(seq).padStart(3, '0')}`,
      status: 'WAITING',
    });
  }

  await prisma.queueTicket.createMany({ data: tickets });
  await prisma.serviceCounter.update({ where: { id: counter.id }, data: { ticketCounter: startSeq + count - 1 } });

  console.log(`\n✅ ${tickets.length} tickets WAITING créés (${tickets[0].ticketNumber} → ${tickets[tickets.length - 1].ticketNumber})`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
