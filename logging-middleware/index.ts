
// Use global fetch if available (Node 18+), otherwise require('node-fetch')
let fetchFn: typeof fetch;
if (typeof fetch !== 'undefined') {
  fetchFn = fetch;
} else {
  // @ts-ignore
  fetchFn = require('node-fetch');
}

let loggerConfig = {
  baseURL: 'http://20.244.56.144/evaluation-service'
};
let accessToken = '';

export function initLogger(cfg: any) {
  if (cfg && cfg.baseURL) loggerConfig.baseURL = cfg.baseURL;
  if (cfg && cfg.accessToken) accessToken = cfg.accessToken;
}

export async function Log(
  stack: string,
  level: string,
  pkg: string,
  message: string
) {
  await fetchFn(`${loggerConfig.baseURL}/logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ stack, level, package: pkg, message })
  });
}
