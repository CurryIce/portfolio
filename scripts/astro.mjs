// Keep this project's build independent of global telemetry configuration paths.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
if (process.argv.includes('--require-site')) {
  process.env.REQUIRE_SITE_URL = '1';
  process.argv = process.argv.filter(argument => argument !== '--require-site');
}
await import('../node_modules/astro/bin/astro.mjs');
