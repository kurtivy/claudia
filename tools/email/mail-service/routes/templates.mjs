// Claudia Mail — Template Routes
// Email template CRUD with variable substitution

import express from 'express';
import { run, get, all } from '../db.mjs';

const router = express.Router();

// Create template
router.post('/templates', (req, res) => {
  try {
    const { slug, name, subject, text_body, html_body, variables, created_by } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ error: 'slug and name required' });
    }

    const existing = get('SELECT id FROM templates WHERE slug = ?', slug);
    if (existing) {
      return res.status(409).json({ error: 'Template already exists', id: existing.id });
    }

    run(
      `INSERT INTO templates (slug, name, subject, text_body, html_body, variables, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      slug,
      name,
      subject || null,
      text_body || null,
      html_body || null,
      variables ? JSON.stringify(variables) : null,
      created_by || 'api'
    );

    const created = get('SELECT * FROM templates WHERE slug = ?', slug);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all templates
router.get('/templates', (req, res) => {
  try {
    const templates = all(
      'SELECT id, slug, name, subject, variables, created_by, created_at, updated_at FROM templates ORDER BY updated_at DESC'
    );
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get template
router.get('/templates/:slug', (req, res) => {
  try {
    const template = get('SELECT * FROM templates WHERE slug = ? OR id = ?',
      req.params.slug, parseInt(req.params.slug) || 0);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update template
router.put('/templates/:slug', (req, res) => {
  try {
    const template = get('SELECT id FROM templates WHERE slug = ? OR id = ?',
      req.params.slug, parseInt(req.params.slug) || 0);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { name, subject, text_body, html_body, variables } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (subject !== undefined) { updates.push('subject = ?'); params.push(subject); }
    if (text_body !== undefined) { updates.push('text_body = ?'); params.push(text_body); }
    if (html_body !== undefined) { updates.push('html_body = ?'); params.push(html_body); }
    if (variables !== undefined) { updates.push('variables = ?'); params.push(JSON.stringify(variables)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(template.id);
    run(`UPDATE templates SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const updated = get('SELECT * FROM templates WHERE id = ?', template.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete template
router.delete('/templates/:slug', (req, res) => {
  try {
    const template = get('SELECT id, slug FROM templates WHERE slug = ? OR id = ?',
      req.params.slug, parseInt(req.params.slug) || 0);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    run('DELETE FROM templates WHERE id = ?', template.id);
    res.json({ success: true, deleted: template.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Template rendering helper (exported for campaign engine) ──

export function renderTemplate(template, variables) {
  let text = template;
  if (!text) return '';

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    text = text.replace(regex, value || '');
  }

  // Clean up any remaining unresolved variables
  text = text.replace(/\{\{\s*\w+\s*\}\}/g, '');
  return text;
}

export default router;
