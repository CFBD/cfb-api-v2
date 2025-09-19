import { default as cors } from './cors';
import { checkCallQuotas } from './quotas';
import { createRateSlowdown } from './slowdown';

const rateSlowdown = createRateSlowdown([
  {
    path: '/stats/player/season',
    methods: ['GET'],
    windowMs: 10000,
    delayAfter: 15,
    delayMs: 250,
    maxDelayMs: 2000,
  },
]);

export default {
  standard: [rateSlowdown, checkCallQuotas],
  cors,
  checkCallQuotas,
  rateSlowdown,
};
