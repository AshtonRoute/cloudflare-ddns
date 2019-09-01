const Joi = require('@hapi/joi');
const dgram = require('dgram');
const dns = require('dns-socket');
const { promisify } = require('util');

const type = {
	v4: {
    dnsServer: '208.67.222.222',

		dnsQuestion: {
			name: 'myip.opendns.com',
			type: 'A'
    },

    ipSchema: Joi.string().trim().required().ip({
      version: [
        'ipv4',
      ],

      cidr: 'forbidden',
    }),
  },

	v6: {
    dnsServer: '2620:0:ccc::2',

		dnsQuestion: {
			name: 'myip.opendns.com',
			type: 'AAAA'
    },

    ipSchema: Joi.string().trim().required().ip({
      version: [
        'ipv6',
      ],

      cidr: 'forbidden',
    }),
	}
};

function queryDns(version, options = {}) {
	const {
    dnsQuestion,
    dnsServer,
    ipSchema,
  } = type[version];

  const {
    retries,
    timeout,
  } = options;

	const socket = dns({
    socket: dgram.createSocket(version === 'v6' ? 'udp6' : 'udp4'),
		retries,
		timeout,
	});

	const socketQuery = promisify(socket.query.bind(socket));

	const promise = socketQuery({questions: [dnsQuestion]}, 53, dnsServer).then(async ({ answers }) => {
    const [answer] = answers;
    const ip = answer && answer.data;

    await ipSchema.validate(ip);

		return ip;
	}).finally(() => {
		socket.destroy();
	});

	promise.cancel = () => {
		socket.cancel();
	};

	return promise;
}

async function promiseIgnoreError(prom) {
  try {
    const value = await prom;

    return {
      value,
      error: null,
    };
  } catch (err) {
    return {
      value: null,
      error: err,
    };
  }
}

async function getIPs(opts = {}) {
  const {
    versions = ['v4', 'v6'],
    retries,
    timeout,
  } = opts;

  const results = await Promise.all(versions.map(v => promiseIgnoreError(queryDns(v, { timeout, retries }))));

  return versions.map((v, idx) => {
    return {
      version: v,
      result: results[idx],
    };
  });
}

module.exports.getIPs = getIPs;
