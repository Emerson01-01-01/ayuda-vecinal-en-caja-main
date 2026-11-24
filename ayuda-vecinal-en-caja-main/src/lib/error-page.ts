export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" />
    <style>
      body { font: 15px/1.6 Inter, system-ui, sans-serif; background: #102d4e; color: #123c68; box-sizing: border-box; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; box-sizing: border-box; background: #fff; border: 1.5px solid #000; border-radius: 1.5rem; box-shadow: 0 12px 36px -16px rgb(18 60 104 / 0.15); }
      h1 { font-family: Poppins, system-ui, sans-serif; font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #526980; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.75rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; transition: transform 250ms ease, box-shadow 250ms ease; }
      .primary { background: #e52435; color: #fff; }
      .secondary { background: #fff; color: #123c68; border-color: #bdcddd; }
      @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) { a:hover, button:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgb(0 0 0 / 0.2); } }
      @media (prefers-reduced-motion: reduce) { a, button { transition: none; } }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
