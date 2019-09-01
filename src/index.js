const { partition } = require('lodash');

const ENV = require('./environment').default;
const log = require('./logger').default;
const { getConfig } = require('./config');
const { getIPs } = require('./ip');
const { schedule } = require('./cloudflare');

async function main() {
  const {
    domains,
    ttl,
  } = getConfig();

  log.debug('domains', domains);

  log.info('Getting ip probes...');
  const ips = await getIPs({
    timeout: ENV.DNS_TIMEOUT,
    retries: 0,
   });

  log.info('Received probes', ips);

  const [valid, invalid] = partition(ips, v => !v.result.error);

  if (invalid.length) {
    log.warn('The following ip types will be ignored', invalid.map(v => v.version));
  }

  if (!valid.length) {
    process.exit(1);
    return;
  }

  await schedule({
    apiToken: ENV.CLOUDFLARE_TOKEN,
    retries: ENV.DNS_RETRIES,
    timeout: ENV.DNS_TIMEOUT,
    versions: valid.map(v => v.version),
    domains,
    ttl,
    updateInterval: ENV.UPDATE_INTERVAL,
  });
}

main().catch(log.error);
