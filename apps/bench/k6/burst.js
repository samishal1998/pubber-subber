// Short high-rate burst with ramp-up. Useful for spotting where each adapter
// starts to queue or drop.

import { check } from 'k6';
import http from 'k6/http';

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '5s', target: 500 },
        { duration: '5s', target: 2000 },
        { duration: '5s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
};

const BASE = __ENV.BASE_URL || 'http://localhost:3210';

export default function () {
  const payload = JSON.stringify({ vu: __VU, iter: __ITER });
  const res = http.post(`${BASE}/publish`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'status 202': (r) => r.status === 202 });
}
