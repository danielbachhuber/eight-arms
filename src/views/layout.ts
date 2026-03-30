export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Eight Arms</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #fff; }
    a { color: #60a5fa; }
    code { background: #222; padding: 1px 5px; border-radius: 3px; font-size: 0.85em; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
    .hint { font-size: 0.85rem; color: #888; margin-bottom: 0.75rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge.ok { background: #1a3a1a; color: #4ade80; }
    .badge.off { background: #3a1a1a; color: #f87171; }
    input[type="text"], input[type="password"] { width: 100%; padding: 0.5rem 0.75rem; background: #0a0a0a; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 0.9rem; margin-bottom: 0.5rem; }
    button { padding: 0.5rem 1rem; border: none; border-radius: 4px; font-size: 0.85rem; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { background: #333; color: #f87171; }
    .btn-danger:hover { background: #444; }
    .btn-success { background: #059669; color: white; }
    .btn-success:hover { background: #047857; }
    .actions { display: flex; align-items: center; gap: 0.5rem; }
    .status { font-size: 0.85rem; margin-top: 0.5rem; color: #888; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}
