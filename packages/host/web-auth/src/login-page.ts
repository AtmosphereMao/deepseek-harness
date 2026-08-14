/**
 * The inline password login page. Self-contained (no external assets) so it
 * renders before the app boots and before any `/plugins` or `/api` access is
 * granted — an unauthenticated visitor never receives the boot manifest.
 * @module @deepseek-ai/dsh-host-web-auth/login-page
 */

/** Render the inline password login page. */
export function renderLoginPage(loginPath: string, error?: string): string {
  const errorHtml = error === undefined ? '' : `<p class="error" role="alert">${error}</p>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0e14; color: #e6e8ec;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { width: min(22rem, calc(100vw - 2rem)); }
  .card {
    background: #131722; border: 1px solid #242b3a; border-radius: 12px;
    padding: 2rem; display: grid; gap: 1rem;
  }
  h1 { margin: 0; font-size: 1.1rem; font-weight: 600; letter-spacing: .02em; }
  .sub { margin: 0; color: #8b93a7; font-size: .85rem; }
  form { display: grid; gap: .75rem; }
  input {
    width: 100%; padding: .6rem .75rem; border-radius: 8px;
    border: 1px solid #2c3446; background: #0e121b; color: #e6e8ec; font-size: 1rem;
  }
  input:focus { outline: none; border-color: #4f6ef7; }
  button {
    padding: .6rem .75rem; border-radius: 8px; border: none; cursor: pointer;
    background: #4f6ef7; color: #fff; font-size: 1rem; font-weight: 600;
  }
  button:hover { background: #5d7bf8; }
  .error { margin: 0; color: #f0767a; font-size: .85rem; }
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>DeepSeek Harness</h1>
    <p class="sub">输入访问密码以进入</p>
    <form method="POST" action="${loginPath}" autocomplete="off">
      <input type="password" name="password" placeholder="访问密码" autofocus required>
      <button type="submit">进入</button>
    </form>
    ${errorHtml}
  </div>
</main>
</body>
</html>
`
}
