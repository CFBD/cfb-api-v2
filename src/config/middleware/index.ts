import { default as cors } from './cors';
import { checkCallQuotas } from './quotas';

export default {
  standard: [cors, checkCallQuotas],
  cors,
  checkCallQuotas,
};
