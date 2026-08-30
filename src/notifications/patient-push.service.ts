import { Injectable, Logger } from '@nestjs/common';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PatientPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
}

/**
 * Envoi de notifications push via Expo Push Service.
 * Expo relaie automatiquement vers APNs (iOS) et FCM (Android).
 */
@Injectable()
export class PatientPushService {
  private readonly logger = new Logger(PatientPushService.name);

  async send(message: PatientPushMessage): Promise<void> {
    if (!message.to.startsWith('ExponentPushToken')) {
      this.logger.warn(`Jeton non Expo ignoré : ${message.to.slice(0, 24)}...`);
      return;
    }

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify([message]),
      });
      this.logger.log(`Push Expo → ${res.status} (${message.to.slice(0, 24)}...)`);
      if (!res.ok) {
        this.logger.error(`Erreur response Expo push : ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Erreur envoi push : ${String(err)}`);
    }
  }
}