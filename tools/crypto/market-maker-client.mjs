#!/usr/bin/env node
// market-maker-client.mjs — Node.js client for the FastAPI market maker
// Wraps all REST endpoints for use by Claudia's autonomous tools.
// Usage as module: import { MarketMakerClient } from './market-maker-client.mjs'
// Usage as CLI:    node market-maker-client.mjs  (runs health check)

class MarketMakerClient {
  constructor(baseUrl = 'http://localhost:5001') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = null;
  }

  // --- internal helpers ---

  _headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async _request(method, path, body = undefined) {
    const url = `${this.baseUrl}${path}`;
    const opts = { method, headers: this._headers(!!body) };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch {}
      if (text.length > 300) text = text.slice(0, 300) + '...';
      throw new Error(`${method} ${path} returned ${res.status}: ${text}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  // --- public API ---

  async health() {
    return this._request('GET', '/health');
  }

  async login(email, password) {
    const data = await this._request('POST', '/api/auth/login', { email, password });
    this.token = data.token || data.access_token || null;
    return data;
  }

  async listWallets(chain = 'solana') {
    return this._request('GET', `/api/wallets?chain=${encodeURIComponent(chain)}`);
  }

  async uploadMetadata({ name, symbol, description, imageUrl, twitter, telegram, website }) {
    return this._request('POST', '/api/tokens/launch/upload-metadata', {
      name,
      symbol,
      description: description || `${name} token`,
      image_url: imageUrl || '',
      twitter: twitter || '',
      telegram: telegram || '',
      website: website || '',
    });
  }

  async validateLaunch(config) {
    // config: inner launch config (name, symbol, metadata_uri, creator_pubkey, ...)
    return this._request('POST', '/api/tokens/launch/validate', {
      chain: 'solana',
      platform: 'pumpfun',
      config,
    });
  }

  async launchToken(config, postLaunch = null) {
    // config: inner launch config (name, symbol, metadata_uri, creator_pubkey, ...)
    const body = { chain: 'solana', platform: 'pumpfun', config };
    if (postLaunch) body.post_launch = postLaunch;
    return this._request('POST', '/api/tokens/launch', body);
  }

  async listTokens() {
    return this._request('GET', '/api/tokens');
  }

  async getToken(address) {
    return this._request('GET', `/api/tokens/${encodeURIComponent(address)}`);
  }

  async executeTrade(opts) {
    // opts: { token_address, direction, amount_usd, wallet_address?, slippage_bps? }
    return this._request('POST', '/api/trade', {
      token_address: opts.token_address,
      direction: opts.direction,
      amount_usd: opts.amount_usd,
      wallet_address: opts.wallet_address || '',
      slippage_bps: opts.slippage_bps ?? 500,
    });
  }

  async startBot(config) {
    return this._request('POST', '/api/bots', config);
  }

  async stopBot(botId) {
    return this._request('POST', `/api/bots/${encodeURIComponent(botId)}/stop`);
  }

  async listBots() {
    return this._request('GET', '/api/bots');
  }
}

export { MarketMakerClient };
export default MarketMakerClient;

// --- CLI mode: run health check ---
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('market-maker-client.mjs')) {
  const client = new MarketMakerClient();
  console.log(`Checking market maker at ${client.baseUrl} ...`);
  client.health()
    .then(r => { console.log('Health:', JSON.stringify(r, null, 2)); })
    .catch(err => {
      if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        console.log('Market maker not running (connection refused). Client is ready for when it starts.');
      } else {
        console.error('Health check failed:', err.message);
      }
      process.exit(0); // exit clean either way
    });
}
