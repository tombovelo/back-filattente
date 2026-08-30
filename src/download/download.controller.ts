import { Controller, Get, Header } from '@nestjs/common';

const APK_URL = '/apk/app.apk';
const APK_ADMIN_URL = '/apk/app-admin.apk';

/**
 * Pages publiques de téléchargement des APK FilAttente.
 * Accessibles sans authentification (scannées via QR code).
 */
@Controller()
export class DownloadController {
  @Get('download')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDownloadPage(): string {
    return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FilAttente — Téléchargement</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        color: #0f172a;
      }
      .card {
        background: #ffffff;
        max-width: 420px;
        width: 100%;
        border-radius: 20px;
        padding: 32px 28px;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.35);
      }
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 22px;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 8px;
      }
      .logo svg { width: 24px; height: 24px; color: #2563eb; }
      h1 { font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
      p.subtitle { color: #64748b; font-size: 15px; margin-bottom: 24px; line-height: 1.5; }
      .btn {
        display: block;
        width: 100%;
        background: #2563eb;
        color: #ffffff;
        text-decoration: none;
        font-size: 17px;
        font-weight: 700;
        padding: 16px;
        border-radius: 12px;
        transition: background 0.2s;
      }
      .btn:hover { background: #1d4ed8; }
      .note { margin-top: 16px; font-size: 12px; color: #94a3b8; }
      .note a { color: #2563eb; text-decoration: none; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><circle cx="12" cy="12" r="2"/></svg>
        FilAttente
      </div>
      <h1>Télécharger l'application</h1>
      <p class="subtitle">Installez l'application mobile FilAttente pour gérer les files d'attente depuis votre téléphone.</p>
      <a class="btn" href="${APK_URL}">Télécharger l'APK</a>
      <p class="note">Android · APK direct · <a href="${APK_URL}">${APK_URL}</a></p>
    </div>
  </body>
</html>`;
  }

  @Get('download-admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDownloadAdminPage(): string {
    return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FilAttente — Téléchargement Admin</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        color: #0f172a;
      }
      .card {
        background: #ffffff;
        max-width: 420px;
        width: 100%;
        border-radius: 20px;
        padding: 32px 28px;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.35);
      }
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 22px;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 8px;
      }
      .logo svg { width: 24px; height: 24px; color: #7c3aed; }
      h1 { font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
      p.subtitle { color: #64748b; font-size: 15px; margin-bottom: 24px; line-height: 1.5; }
      .btn {
        display: block;
        width: 100%;
        background: #7c3aed;
        color: #ffffff;
        text-decoration: none;
        font-size: 17px;
        font-weight: 700;
        padding: 16px;
        border-radius: 12px;
        transition: background 0.2s;
      }
      .btn:hover { background: #6d28d9; }
      .note { margin-top: 16px; font-size: 12px; color: #94a3b8; }
      .note a { color: #7c3aed; text-decoration: none; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><circle cx="12" cy="12" r="2"/></svg>
        FilAttente Admin
      </div>
      <h1>Télécharger l'application Admin</h1>
      <p class="subtitle">Installez l'application mobile FilAttente Admin pour gérer votre société et vos agents</p>
      <a class="btn" href="${APK_ADMIN_URL}">Télécharger l'APK Admin</a>
      <p class="note">Android · APK direct · <a href="${APK_ADMIN_URL}">${APK_ADMIN_URL}</a></p>
    </div>
  </body>
</html>`;
  }
}