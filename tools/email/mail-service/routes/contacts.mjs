// Claudia Mail — Contacts & Lists Routes
// CSV import, contact CRUD, list management, search

import express from 'express';
import { run, get, all } from '../db.mjs';

const router = express.Router();

// ── Helpers ──

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields with commas inside
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// ── Contact Import (CSV) ──

router.post('/contacts/import', (req, res) => {
  try {
    // Accept CSV as raw body text, JSON body with `csv` field, or `contacts` array
    let contacts = [];
    let listSlug = req.body?.list || req.query?.list || null;

    if (req.body?.csv) {
      // CSV text in JSON body
      const { headers, rows } = parseCSV(req.body.csv);
      contacts = rows;
    } else if (req.body?.contacts && Array.isArray(req.body.contacts)) {
      // Direct JSON array
      contacts = req.body.contacts;
    } else if (typeof req.body === 'string') {
      // Raw CSV text
      const { headers, rows } = parseCSV(req.body);
      contacts = rows;
    } else {
      return res.status(400).json({
        error: 'Provide CSV text in body.csv, or contacts array in body.contacts',
        example: {
          csv: 'email,name,company\njohn@example.com,John Doe,Acme Corp',
          list: 'my-list'
        }
      });
    }

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts found in import data' });
    }

    // If a list is specified, ensure it exists
    let listId = null;
    if (listSlug) {
      let list = get('SELECT id FROM lists WHERE slug = ?', listSlug);
      if (!list) {
        // Auto-create the list
        run('INSERT INTO lists (slug, name) VALUES (?, ?)',
          listSlug, listSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
        list = get('SELECT id FROM lists WHERE slug = ?', listSlug);
      }
      listId = list.id;
    }

    let imported = 0;
    let skipped = 0;
    let updated = 0;
    const errors = [];

    for (const contact of contacts) {
      const email = normalizeEmail(contact.email || contact.Email || contact.EMAIL);
      if (!email || !email.includes('@')) {
        skipped++;
        continue;
      }

      const name = contact.name || contact.Name || contact.NAME ||
                   contact.first_name || contact.FirstName || null;
      const company = contact.company || contact.Company || contact.COMPANY ||
                      contact.organization || null;
      const role = contact.role || contact.Role || contact.title || contact.Title || null;
      const tags = contact.tags || contact.Tags || null;
      const source = contact.source || 'csv-import';

      try {
        // Upsert contact
        const existing = get('SELECT id FROM contacts WHERE email = ?', email);

        if (existing) {
          // Update non-null fields only
          const updates = [];
          const params = [];
          if (name) { updates.push('name = ?'); params.push(name); }
          if (company) { updates.push('company = ?'); params.push(company); }
          if (role) { updates.push('role = ?'); params.push(role); }
          if (tags) { updates.push('tags = ?'); params.push(tags); }
          updates.push("updated_at = datetime('now')");

          if (updates.length > 1) {
            params.push(existing.id);
            run(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`, ...params);
            updated++;
          } else {
            skipped++;
          }
        } else {
          run(
            'INSERT INTO contacts (email, name, company, role, tags, source) VALUES (?, ?, ?, ?, ?, ?)',
            email, name, company, role, tags, source
          );
          imported++;
        }

        // Add to list if specified
        if (listId) {
          const contactRow = get('SELECT id FROM contacts WHERE email = ?', email);
          if (contactRow) {
            const membership = get(
              'SELECT contact_id FROM list_members WHERE contact_id = ? AND list_id = ?',
              contactRow.id, listId
            );
            if (!membership) {
              run('INSERT INTO list_members (contact_id, list_id) VALUES (?, ?)',
                contactRow.id, listId);
            }
          }
        }
      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }

    res.json({
      success: true,
      imported,
      updated,
      skipped,
      total: contacts.length,
      errors: errors.length > 0 ? errors : undefined,
      list: listSlug || undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Contact CRUD ──

// List / Search contacts
router.get('/contacts', (req, res) => {
  try {
    const { search, list, page = 1, limit = 50, opted_out } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = [];

    if (search) {
      where.push('(c.email LIKE ? OR c.name LIKE ? OR c.company LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (opted_out === '1' || opted_out === 'true') {
      where.push('c.global_optout = 1');
    } else if (opted_out === '0' || opted_out === 'false') {
      where.push('c.global_optout = 0');
    }

    let joinClause = '';
    if (list) {
      joinClause = 'JOIN list_members lm ON lm.contact_id = c.id JOIN lists l ON l.id = lm.list_id';
      where.push('l.slug = ? AND lm.subscribed = 1');
      params.push(list);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // Count
    const countRow = get(
      `SELECT COUNT(*) as count FROM contacts c ${joinClause} ${whereClause}`,
      ...params
    );

    // Fetch page
    const pageParams = [...params, parseInt(limit), offset];
    const contacts = all(
      `SELECT c.id, c.email, c.name, c.company, c.role, c.tags, c.source, c.verified,
              c.global_optout, c.bounce_count, c.created_at, c.updated_at
       FROM contacts c ${joinClause} ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      ...pageParams
    );

    res.json({
      contacts,
      pagination: {
        total: countRow.count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRow.count / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single contact with send history
router.get('/contacts/:id', (req, res) => {
  try {
    const contact = get('SELECT * FROM contacts WHERE id = ?', parseInt(req.params.id));
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get list memberships
    const lists = all(
      `SELECT l.slug, l.name, lm.subscribed, lm.subscribed_at, lm.unsubscribed_at
       FROM list_members lm
       JOIN lists l ON l.id = lm.list_id
       WHERE lm.contact_id = ?`,
      contact.id
    );

    // Get recent sends
    const sends = all(
      `SELECT s.id, s.status, s.sent_at, s.opened_at, s.clicked_at, s.error,
              c.name as campaign_name, c.slug as campaign_slug
       FROM sends s
       LEFT JOIN campaigns c ON c.id = s.campaign_id
       WHERE s.contact_id = ?
       ORDER BY s.sent_at DESC
       LIMIT 20`,
      contact.id
    );

    res.json({ ...contact, lists, sends });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create single contact
router.post('/contacts', (req, res) => {
  try {
    const { email, name, company, role, tags, source } = req.body;
    const normalized = normalizeEmail(email);

    if (!normalized || !normalized.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const existing = get('SELECT id FROM contacts WHERE email = ?', normalized);
    if (existing) {
      return res.status(409).json({ error: 'Contact already exists', id: existing.id });
    }

    run(
      'INSERT INTO contacts (email, name, company, role, tags, source) VALUES (?, ?, ?, ?, ?, ?)',
      normalized, name || null, company || null, role || null,
      tags ? JSON.stringify(tags) : null, source || 'manual'
    );

    const created = get('SELECT * FROM contacts WHERE email = ?', normalized);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update contact
router.put('/contacts/:id', (req, res) => {
  try {
    const contact = get('SELECT id FROM contacts WHERE id = ?', parseInt(req.params.id));
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { name, company, role, tags, global_optout } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (company !== undefined) { updates.push('company = ?'); params.push(company); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(typeof tags === 'string' ? tags : JSON.stringify(tags)); }
    if (global_optout !== undefined) {
      updates.push('global_optout = ?');
      params.push(global_optout ? 1 : 0);
      if (global_optout) {
        updates.push("optout_date = datetime('now')");
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(contact.id);
    run(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const updated = get('SELECT * FROM contacts WHERE id = ?', contact.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete contact
router.delete('/contacts/:id', (req, res) => {
  try {
    const contact = get('SELECT id FROM contacts WHERE id = ?', parseInt(req.params.id));
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    run('DELETE FROM contacts WHERE id = ?', contact.id);
    res.json({ success: true, deleted: contact.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lists ──

// Create list
router.post('/lists', (req, res) => {
  try {
    const { slug, name, description } = req.body;
    if (!slug || !name) {
      return res.status(400).json({ error: 'slug and name required' });
    }

    const existing = get('SELECT id FROM lists WHERE slug = ?', slug);
    if (existing) {
      return res.status(409).json({ error: 'List already exists', id: existing.id });
    }

    run('INSERT INTO lists (slug, name, description) VALUES (?, ?, ?)',
      slug, name, description || null);

    const created = get('SELECT * FROM lists WHERE slug = ?', slug);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all lists with member counts
router.get('/lists', (req, res) => {
  try {
    const lists = all(`
      SELECT l.*,
             COUNT(CASE WHEN lm.subscribed = 1 THEN 1 END) as active_members,
             COUNT(lm.contact_id) as total_members
      FROM lists l
      LEFT JOIN list_members lm ON lm.list_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `);

    res.json({ lists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get list detail
router.get('/lists/:slug', (req, res) => {
  try {
    const list = get('SELECT * FROM lists WHERE slug = ?', req.params.slug);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const members = all(`
      SELECT c.id, c.email, c.name, c.company, lm.subscribed, lm.subscribed_at
      FROM list_members lm
      JOIN contacts c ON c.id = lm.contact_id
      WHERE lm.list_id = ?
      ORDER BY lm.subscribed_at DESC
    `, list.id);

    res.json({ ...list, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add contacts to list
router.post('/lists/:slug/add', (req, res) => {
  try {
    const list = get('SELECT id FROM lists WHERE slug = ?', req.params.slug);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const { emails, contact_ids } = req.body;
    let added = 0;
    let skipped = 0;

    // Support adding by email addresses or contact IDs
    const ids = [];

    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        const contact = get('SELECT id FROM contacts WHERE email = ?', normalizeEmail(email));
        if (contact) {
          ids.push(contact.id);
        } else {
          // Auto-create contact
          run('INSERT INTO contacts (email, source) VALUES (?, ?)', normalizeEmail(email), 'list-add');
          const newContact = get('SELECT id FROM contacts WHERE email = ?', normalizeEmail(email));
          if (newContact) ids.push(newContact.id);
        }
      }
    }

    if (contact_ids && Array.isArray(contact_ids)) {
      ids.push(...contact_ids.map(id => parseInt(id)));
    }

    for (const contactId of ids) {
      const existing = get(
        'SELECT contact_id FROM list_members WHERE contact_id = ? AND list_id = ?',
        contactId, list.id
      );

      if (existing) {
        // Re-subscribe if previously unsubscribed
        if (!existing.subscribed) {
          run(`UPDATE list_members SET subscribed = 1, subscribed_at = datetime('now'), unsubscribed_at = NULL
               WHERE contact_id = ? AND list_id = ?`, contactId, list.id);
          added++;
        } else {
          skipped++;
        }
      } else {
        run('INSERT INTO list_members (contact_id, list_id) VALUES (?, ?)', contactId, list.id);
        added++;
      }
    }

    res.json({ success: true, added, skipped, list: req.params.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove contacts from list (unsubscribe, not delete)
router.post('/lists/:slug/remove', (req, res) => {
  try {
    const list = get('SELECT id FROM lists WHERE slug = ?', req.params.slug);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const { emails, contact_ids } = req.body;
    let removed = 0;

    const ids = [];

    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        const contact = get('SELECT id FROM contacts WHERE email = ?', normalizeEmail(email));
        if (contact) ids.push(contact.id);
      }
    }

    if (contact_ids && Array.isArray(contact_ids)) {
      ids.push(...contact_ids.map(id => parseInt(id)));
    }

    for (const contactId of ids) {
      const result = run(
        `UPDATE list_members SET subscribed = 0, unsubscribed_at = datetime('now')
         WHERE contact_id = ? AND list_id = ? AND subscribed = 1`,
        contactId, list.id
      );
      if (result.changes > 0) removed++;
    }

    res.json({ success: true, removed, list: req.params.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete list
router.delete('/lists/:slug', (req, res) => {
  try {
    const list = get('SELECT id FROM lists WHERE slug = ?', req.params.slug);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Remove all memberships first
    run('DELETE FROM list_members WHERE list_id = ?', list.id);
    run('DELETE FROM lists WHERE id = ?', list.id);

    res.json({ success: true, deleted: req.params.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
