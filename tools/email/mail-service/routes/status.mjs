// Claudia Mail — Status & Stats Routes

import { Router } from 'express';
import { get, all } from '../db.mjs';
import { getAccountStats } from '../lib/sender.mjs';

const router = Router();

// GET /api/status — Health check
router.get('/status', (req, res) => {
  try {
    // Quick DB health check
    const dbCheck = get('SELECT COUNT(*) as contacts FROM contacts');
    const accounts = getAccountStats();

    res.json({
      ok: true,
      service: 'claudia-mail',
      version: '1.0.0',
      db: {
        contacts: dbCheck?.contacts || 0,
      },
      accounts: {
        total: accounts.length,
        active: accounts.filter(a => a.enabled).length,
        providers: {
          bluehost: accounts.filter(a => a.provider === 'bluehost').length,
          resend: accounts.filter(a => a.provider === 'resend').length,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/stats — Global statistics
router.get('/stats', (req, res) => {
  try {
    const contacts = get('SELECT COUNT(*) as total, SUM(global_optout) as opted_out, SUM(verified) as verified FROM contacts');
    const lists = get('SELECT COUNT(*) as total FROM lists');
    const campaigns = all(`SELECT status, COUNT(*) as count FROM campaigns GROUP BY status`);
    const sends = get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
    FROM sends`);

    const totalSent = sends?.sent || 0;
    const openRate = totalSent > 0 ? ((sends?.opened || 0) / totalSent * 100).toFixed(1) : '0.0';
    const clickRate = totalSent > 0 ? ((sends?.clicked || 0) / totalSent * 100).toFixed(1) : '0.0';
    const bounceRate = totalSent > 0 ? ((sends?.bounced || 0) / totalSent * 100).toFixed(1) : '0.0';

    const accounts = getAccountStats();

    res.json({
      contacts: {
        total: contacts?.total || 0,
        opted_out: contacts?.opted_out || 0,
        verified: contacts?.verified || 0,
      },
      lists: lists?.total || 0,
      campaigns: Object.fromEntries(campaigns.map(c => [c.status, c.count])),
      sends: {
        total: sends?.total || 0,
        sent: totalSent,
        failed: sends?.failed || 0,
        bounced: sends?.bounced || 0,
        opened: sends?.opened || 0,
        clicked: sends?.clicked || 0,
      },
      rates: {
        open: `${openRate}%`,
        click: `${clickRate}%`,
        bounce: `${bounceRate}%`,
      },
      accounts: accounts.map(a => ({
        email: a.email,
        provider: a.provider,
        enabled: !!a.enabled,
        sends_today: a.sends_today,
        sends_this_hour: a.sends_this_hour,
        daily_limit: a.daily_limit,
        hourly_limit: a.hourly_limit,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
