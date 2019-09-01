const Bluebird = require('bluebird');
const { keyBy, omit } = require('lodash');
const parseDomain = require('parse-domain');
const cf = require('cloudflare');

const log = require('./logger').default;
const { getIPs } = require('./ip');

const ipRecordType = {
  v4: 'A',
  v6: 'AAAA',
};

async function updateEntries(opts) {
  const {
    client,
    timeout,
    versions,
    zones,
    ttl,
    updateInterval,
    lastIPs,
  } = opts;

  log.info('Fetching ips...', versions);

  const ips = await getIPs({
    versions,
    timeout,
  });

  log.info('Received ips', ips);

  let ipsToUpdate = ips;

  if (lastIPs) {
    const groupByVer = keyBy(lastIPs, 'version');

    ipsToUpdate = ipsToUpdate.filter(v => {
      const lastIP = groupByVer[v.version];
      if (!lastIP) return true;

      return v.result.value !== lastIP.result.value;
    });
  }

  if (ipsToUpdate.length) {
    let updatedCnt = 0;
    log.info(`${lastIPs ? 'Some ips changed. ' : ''}Updating...`, ipsToUpdate);

    await Bluebird.map(ipsToUpdate, async ({ version, result: { value: ip } }) => {
      const recordName = ipRecordType[version];

      await Bluebird.map(zones, async ([_, zone]) => {
        const dbRecords = await client.dnsRecords.browse(zone.id, { type: recordName });

        const recordsToUpdate = zone.domains.reduce((o, domain) => {
          o.set(domain, {
            id: null,
            type: recordName,
            name: domain,
            content: ip,
            ttl,
          });

          return o;
        }, new Map());

        dbRecords.result.forEach(d => {
          const val = recordsToUpdate.get(d.name);

          if (val) {
            val.id = d.id;
          }
        });

        await Bluebird.map(recordsToUpdate, async ([_, domain]) => {
          const curVal = omit(domain, ['id']);

          if (domain.id) {
            await client.dnsRecords.edit(zone.id, domain.id, curVal);
          } else {
            await client.dnsRecords.add(zone.id, curVal);
          }

          updatedCnt += 1;
        }, { concurrency: 10 });
      }, { concurrency: 10 });
    });

    log.info(`${updatedCnt} records have been updated`);
  } else {
    log.info('Skip DNS records update. No ip changed');
  }

  log.info(`Next update has been scheduled at ${new Date(Date.now() + updateInterval)}`);

  setTimeout(() => {
    updateEntries({
      ...opts,
      lastIPs: ips,
    });
  }, updateInterval);
}

function groupDomainsByZones(domains) {
  const g = new Map();

  domains.forEach(domain => {
    const curD = parseDomain(domain);
    const curZone = `${curD.domain}.${curD.tld}`;
    const curArr = g.get(curZone);

    if (curArr) {
      curArr.push(domain);
    } else {
      g.set(curZone, [domain]);
    }
  });

  return g;
}

async function schedule(opts) {
  const {
    apiToken,
    domains,
    versions,
    ...other
  } = opts;

  const client = cf({
    token: apiToken,
  });

  const groupedZones = groupDomainsByZones(domains);
  const missingZones = [];

  const cfZones = await client.zones.browse();

  cfZones.result.forEach(z => {
    const zoneDomains = groupedZones.get(z.name);

    if (!zoneDomains) {
      missingZones.push(z.name);

      return;
    }

    groupedZones.set(z.name, {
      id: z.id,
      name: z.name,
      domains: zoneDomains,
    });
  });

  if (missingZones.length) {
    throw new Error(`Couldn't find the following zones on CloudFlare: [${missingZones.join(', ')}]`);
  }

  log.info('Scheduled an update for the following ip types', versions);

  return updateEntries({
    versions,
    ...other,

    zones: groupedZones,
    client,
  });
}

module.exports.schedule = schedule;
