// Sustained publish throughput. 50 virtual users hit /publish for 15s.
// Records HTTP-side metrics (request rate, p95, p99) via k6, and the server
// records pub→subscribe latency via the `/metrics` endpoint.

import { check } from 'k6';
import http from 'k6/http';

export const options = {
  scenarios: {
    throughput: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
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
