import type { DocumentProps } from "rwsdk/router";
import styles from "./styles.css?url";

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export const Document = ({ rw, children }: DocumentProps) => {
  const isDev = process.env.NODE_ENV !== "production";
  const cfWebAnalyticsToken = process.env.CF_WEB_ANALYTICS_TOKEN;
  const nonce = rw.nonce;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <link href={styles} rel="stylesheet" />
        <link href="/src/client.tsx" rel="modulepreload" />
        <script id="theme-color-script" nonce={nonce}>
          {THEME_COLOR_SCRIPT}
        </script>
        {isDev ? (
          <>
            <script src="https://unpkg.com/react-scan/dist/auto.global.js" />
            <script src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js" />
          </>
        ) : null}
        {cfWebAnalyticsToken ? (
          <script
            data-cf-beacon={JSON.stringify({ token: cfWebAnalyticsToken })}
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
          />
        ) : null}
      </head>
      <body className="antialiased">
        <div id="root">{children}</div>
        <script nonce={nonce} src="/src/client.tsx" type="module" />
      </body>
    </html>
  );
};
