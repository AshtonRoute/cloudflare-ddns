const ENV = require('./environment').default;

function getConfig() {
  const domains = ENV.DOMAINS.split(',').map(v => v.trim());

  if (!domains.length) {
    throw new Error('No domains specified');
  }

  return {
    domains,
    ttl: ENV.DOMAINS_TTL,
   };
}

module.exports.getConfig = getConfig;
