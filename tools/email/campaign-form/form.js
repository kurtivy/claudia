'use strict';

const API_BASE = '';
const PRICE_PER_THOUSAND_CENTS = 3000;
const MINIMUM_RECIPIENTS = 1000;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const csvInput      = document.getElementById('csv-file');
const fileLabel     = document.getElementById('file-label-text');
const costPreview   = document.getElementById('cost-preview');
const costCount     = document.getElementById('cost-count');
const costAmount    = document.getElementById('cost-amount');
const costMinNote   = document.getElementById('cost-min-note');
const csvError      = document.getElementById('csv-error');
const submitBtn     = document.getElementById('submit-btn');
const formError     = document.getElementById('form-error');
const form          = document.getElementById('campaign-form');

// Store parsed CSV data so we don't re-read on submit
let parsedCsvText   = null;
let recipientCount  = 0;

// ── CSV upload ────────────────────────────────────────────────────────────────

csvInput.addEventListener('change', () => {
  const file = csvInput.files[0];
  if (!file) return;

  fileLabel.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const result = parseCsv(text);

    if (result.error) {
      showCsvError(result.error);
      parsedCsvText = null;
      recipientCount = 0;
      costPreview.style.display = 'none';
      return;
    }

    hideCsvError();
    parsedCsvText = text;
    recipientCount = result.count;
    showCostPreview(recipientCount);
  };

  reader.readAsText(file);
});

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { error: 'CSV must have a header row and at least one data row.' };
  }

  const header = lines[0].toLowerCase();
  const columns = header.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

  if (!columns.includes('email')) {
    return { error: 'CSV must have an "email" column header.' };
  }

  const dataRows = lines.slice(1).filter(l => l.trim().length > 0);
  if (dataRows.length === 0) {
    return { error: 'CSV has no data rows.' };
  }

  return { count: dataRows.length };
}

function showCostPreview(count) {
  const billableThousands = Math.ceil(Math.max(count, MINIMUM_RECIPIENTS) / 1000);
  const totalCents = billableThousands * PRICE_PER_THOUSAND_CENTS;
  const totalDollars = (totalCents / 100).toFixed(2);

  costCount.textContent = count.toLocaleString() + ' recipient' + (count !== 1 ? 's' : '');
  costAmount.textContent = '$' + totalDollars;

  const isBelowMin = count < MINIMUM_RECIPIENTS;
  costMinNote.textContent = isBelowMin
    ? 'Minimum charge: 1,000 recipients ($30.00)'
    : Math.ceil(count / 1000) + ',000 billed emails at $30 per 1,000';

  costPreview.style.display = 'block';
}

function showCsvError(msg) {
  csvError.textContent = msg;
  csvError.style.display = 'block';
}

function hideCsvError() {
  csvError.style.display = 'none';
}

// ── Form submit ───────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  hideFormError();

  // Validate CSV was loaded
  if (!parsedCsvText) {
    showFormError('Please upload a valid recipient CSV file.');
    return;
  }

  const body = document.getElementById('email-body').value.trim();
  const isHtml = looksLikeHtml(body);

  const payload = {
    company_name:        document.getElementById('company-name').value.trim(),
    contact_email:       document.getElementById('contact-email').value.trim(),
    campaign_name:       document.getElementById('campaign-name').value.trim(),
    campaign_description: document.getElementById('description').value.trim() || null,
    subject_line:        document.getElementById('subject').value.trim(),
    email_body_html:     isHtml ? body : null,
    email_body_text:     isHtml ? null : body,
    send_date:           document.getElementById('send-date').value || null,
    csv_data:            parsedCsvText,
    recipient_count:     recipientCount,
    tos_accepted:        true,
  };

  // Basic client-side validation
  const required = ['company_name', 'contact_email', 'campaign_name', 'subject'];
  for (const key of required) {
    if (!payload[key]) {
      showFormError('Please fill in all required fields.');
      return;
    }
  }

  setLoading(true);

  try {
    const resp = await fetch(`${API_BASE}/api/public/submit-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = data.error || data.message || `Server error (${resp.status})`;
      showFormError(msg);
      setLoading(false);
      return;
    }

    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      showFormError('Submission accepted, but no checkout URL was returned. Please contact support.');
      setLoading(false);
    }
  } catch (err) {
    showFormError('Network error. Please check your connection and try again.');
    setLoading(false);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function looksLikeHtml(text) {
  return /<[a-z][\s\S]*>/i.test(text);
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Submitting...' : 'Submit Campaign & Proceed to Payment';
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.style.display = 'block';
  formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideFormError() {
  formError.style.display = 'none';
}
