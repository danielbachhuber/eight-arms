import { layout } from "./layout.js";

interface SettingsPageProps {
  services: Record<string, boolean>;
}

function serviceCard(
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

export function settingsPage({ services }: SettingsPageProps): string {
  const body = `
    ${serviceCard(
      "github",
      "GitHub",
      services.github,
      'Enter a <a href="https://github.com/settings/tokens">Personal Access Token</a> with <code>repo</code>, <code>read:org</code>, and <code>notifications</code> scopes.',
      "ghp_xxxxxxxxxxxx"
    )}

    ${serviceCard(
      "todoist",
      "Todoist",
      services.todoist,
      'Enter your <a href="https://todoist.com/app/settings/integrations/developer">API Token</a> from Todoist Settings → Integrations → Developer.',
      "Todoist API token"
    )}

    <div class="card">
      <h2>Gmail <span class="badge ${services.gmail ? "ok" : "off"}">${services.gmail ? "Connected" : "Not connected"}</span></h2>
      <p class="hint">Gmail requires OAuth. Not yet set up.</p>
    </div>

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

      async function disconnect(service) {
        const el = document.getElementById(service + '-status');
        try {
          await fetch('/api/settings/disconnect/' + service, { method: 'POST' });
          el.textContent = 'Disconnected.';
          setTimeout(() => location.reload(), 500);
        } catch (e) { el.textContent = 'Error: ' + e.message; }
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
