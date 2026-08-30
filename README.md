# FilAttente - Backend

Back-end NestJS pour une file d'attente multi-societes.

## Stack

- NestJS 11
- Prisma 5
- PostgreSQL
- Socket.io pour le temps reel
- JWT pour l'authentification
- Push mobile pour notifier les patients

## Flux principal

1. Le patient scanne un QR brut `COMPANY_X_SERVICE_Y` depuis l'app mobile.
2. L'app mobile enregistre ou utilise son jeton push.
3. Le backend cree le ticket, calcule la position et le temps estime.
4. Le backend envoie les notifications push.
5. Le dashboard guichetier suit la file en temps reel via socket.

## Variables d'environnement

- `DATABASE_URL`
- `PORT`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`

## Commandes

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm run start:dev
```

## API

- `POST /auth/login`
- `GET /auth/me`
- `POST /companies`
- `GET /companies`
- `GET /companies/:id`
- `POST /companies/:id/agents`
- `POST /companies/:id/counters`
- `POST /companies/:id/agents/:agentId/assign-counter/:counterId`
- `POST /tickets/next`
- `PATCH /tickets/:id/complete`
- `PATCH /tickets/:id/absent`
- `GET /tickets/queue-status`

## Temps reel

Namespace `/tickets`, authentifie par JWT dans le handshake.

