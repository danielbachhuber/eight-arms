import { layout } from "./layout.js";

interface SettingsPageProps {
  services: Record<string, boolean>;
  oauthConfigured?: Record<string, boolean>;
}

function tokenCard(
  name: string,
  label: string,
  connected: boolean,
  hint: string,
  placeholder: string
): string {
  return `
  <div class="card">
    <h2>${label} <span class="badge ${connected ? "ok" : "off"}">${connected ? "Connected" : "Not connected"}</span></h2>
    <p class="hint">${hint}</p>
    <input type="password" id="${name}-token" placeholder="${placeholder}" />
    <div class="actions">
      <button class="btn-primary" onclick="saveToken('${name}')">Save Token</button>
      ${connected ? `<button class="btn-danger" onclick="disconnect('${name}')">Disconnect</button>` : ""}
    </div>
    <div class="status" id="${name}-status"></div>
  </div>`;
}

function gmailCard(connected: boolean, oauthConfigured: boolean): string {
  return `
  <div class="card">
    <h2>Gmail <span class="badge ${connected ? "ok" : "off"}">${connected ? "Connected" : "Not connected"}</span></h2>
    <p class="hint">Gmail uses OAuth2. First configure your <a href="https://console.cloud.google.com/apis/credentials">Google Cloud OAuth app</a>, then connect.</p>

    <details ${oauthConfigured ? "" : "open"}>
      <summary style="cursor:pointer;color:#60a5fa;font-size:0.85rem;margin-bottom:0.75rem">${oauthConfigured ? "OAuth app configured — click to update" : "Step 1: Configure OAuth app"}</summary>
      <input type="text" id="gmail-client-id" placeholder="Client ID" />
      <input type="password" id="gmail-client-secret" placeholder="Client Secret" />
      <div class="actions">
        <button class="btn-primary" onclick="saveOAuthConfig('gmail')">Save OAuth Config</button>
      </div>
      <div class="status" id="gmail-config-status"></div>
    </details>

    ${oauthConfigured && !connected ? `
    <div style="margin-top:0.75rem">
      <button class="btn-primary" onclick="startOAuth('gmail')">Connect Gmail</button>
      <div class="status" id="gmail-oauth-status"></div>
    </div>` : ""}

    ${connected ? `
    <div style="margin-top:0.5rem">
      <button class="btn-danger" onclick="disconnect('gmail')">Disconnect</button>
    </div>` : ""}
  </div>`;
}

export function settingsPage({ services, oauthConfigured = {} }: SettingsPageProps): string {
  const body = `
    ${tokenCard(
      "github",
      "GitHub",
      services.github,
      'Enter a <a href="https://github.com/settings/tokens">Personal Access Token</a> with <code>repo</code>, <code>read:org</code>, and <code>notifications</code> scopes.',
      "ghp_xxxxxxxxxxxx"
    )}

    ${tokenCard(
      "todoist",
      "Todoist",
      services.todoist,
      'Enter your <a href="https://todoist.com/app/settings/integrations/developer">API Token</a> from Todoist Settings → Integrations → Developer.',
      "Todoist API token"
    )}

    ${gmailCard(services.gmail, !!oauthConfigured.gmail)}

    <button class="btn-success" onclick="triggerSync()" style="margin-top:0.5rem">Sync Now</button>
    <div class="status" id="sync-status"></div>

    <script>
      async function saveToken(service) {
        const token = document.getElementById(service + '-token').value;
        if (!token) return;
        const el = document.getElementById(service + '-status');
        el.textContent = 'Saving...';
        try {
          const res = await fetch('/api/settings/token/' + service, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const data = await res.json();
          if (data.ok) { el.textContent = 'Saved!'; setTimeout(() => location.reload(), 500); }
          else { el.textContent = 'Error: ' + (data.error || 'Unknown'); }
        } catch (e) { el.textContent = 'Error: ' + e.message; }
      }

      async function saveOAuthConfig(service) {
        const clientId = document.getElementById(service + '-client-id').value;
        const clientSecret = document.getElementById(service + '-client-secret').value;
        if (!clientId || !clientSecret) return;
        const el = document.getElementById(service + '-config-status');
        el.textContent = 'Saving...';
        try {
          const res = await fetch('/api/settings/oauth-config/' + service, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientSecret }),
          });
          const data = await res.json();
          if (data.ok) { el.textContent = 'Saved!'; setTimeout(() => location.reload(), 500); }
          else { el.textContent = 'Error: ' + (data.error || 'Unknown'); }
        } catch (e) { el.textContent = 'Error: ' + e.message; }
      }

      async function startOAuth(service) {
        const el = document.getElementById(service + '-oauth-status');
        el.textContent = 'Starting OAuth...';
        try {
          const res = await fetch('/api/settings/oauth/' + service + '/start', { method: 'POST' });
          const data = await res.json();
          if (data.url) { window.location.href = data.url; }
          else { el.textContent = 'Error: ' + (data.error || 'No URL returned'); }
        } catch (e) { el.textContent = 'Error: ' + e.message; }
      }

      async function disconnect(service) {
        const el = document.getElementById(service + '-status') || document.getElementById(service + '-config-status');
        try {
          await fetch('/api/settings/disconnect/' + service, { method: 'POST' });
          setTimeout(() => location.reload(), 500);
        } catch (e) { if (el) el.textContent = 'Error: ' + e.message; }
      }

      async function triggerSync() {
        const el = document.getElementById('sync-status');
        el.textContent = 'Syncing...';
        try {
          const res = await fetch('/api/sync/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          el.textContent = data.results.map(r =>
            r.success ? r.service + ': ' + JSON.stringify(r.detail) : r.service + ': ERROR — ' + r.error
          ).join(' | ');
        } catch (e) { el.textContent = 'Error: ' + e.message; }
      }
    </script>`;

  return layout("Settings", body);
}
