import { default as cors } from './cors';
import { createConcurrencyLimit } from './concurrency';
import { checkCallQuotas } from './quotas';
import { rejectBadParam } from './rejectBadParams';
import { createRateSlowdown } from './slowdown';
import { requirePatreonTier } from './patreon';

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

const concurrencyLimit = createConcurrencyLimit([
  {
    path: '/live/plays',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/plays/stats',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/stats/player/season',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/stats/season/advanced',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/stats/game/advanced',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/stats/player/success/game',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  // Player season reads without a year aggregate whole careers; parallel
  // per-player sweeps saturated database I/O.
  {
    path: '/stats/player/success',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/ppa/players/season',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/passing/players/season',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
  {
    path: '/rushing/players/season',
    methods: ['GET'],
    maxConcurrent: 2,
    leaseMs: 75000,
  },
]);

export default {
  standard: [rateSlowdown, concurrencyLimit, checkCallQuotas],
  concurrencyLimit,
  cors,
  checkCallQuotas,
  rateSlowdown,
  rejectBadParam,
  requirePatreonTier,
};
