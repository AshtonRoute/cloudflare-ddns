const Joi = require('@hapi/joi');
const { pick } = require('lodash');
const ms = require('ms');

const schema = Joi.object({
  CLOUDFLARE_TOKEN: Joi.string().required(),
  DNS_RETRIES: Joi.number().default(5),
  DNS_TIMEOUT: Joi.number().default(5000),
  UPDATE_INTERVAL: Joi.string().default('5m'),
  DOMAINS: Joi.string().required(),
  DOMAINS_TTL: Joi.number().default(1),
});

let { value, error } = schema.validate(pick(process.env, Object.keys(schema.describe().children)), {
  abortEarly: false,
  allowUnknown: true,
  stripUnknown: {
    arrays: false,
    objects: true,
  },
});

if (error) {
  throw error;
}

value.UPDATE_INTERVAL = ms(value.UPDATE_INTERVAL);

({ error } = Joi.number().integer().min(1).required().label('UPDATE_INTERVAL').validate(value.UPDATE_INTERVAL));

if (error) {
  throw error;
}

module.exports.default = value;
