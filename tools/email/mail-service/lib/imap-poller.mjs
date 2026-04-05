// Claudia Mail — IMAP Poller
// Raw IMAP over TLS for checking Bluehost inboxes for bounces and unsubscribe replies
// Zero dependencies — uses node:tls directly

import { connect as tlsConnect } from 'node:tls';
import { run, get, all } from '../db.mjs';
import config from '../config.mjs';

let pollInterval = null;

// ── Raw IMAP client ──

function imapCommand(socket, tag, command) {
  return new Promise((resolve, reject) => {
    let response = '';
    const tagStr = `A${String(tag).padStart(4, '0')}`;

    const onData = (data) => {
      response += data.toString();
      // Check if we got the tagged response (completion)
      if (response.includes(`${tagStr} OK`) || response.includes(`${tagStr} NO`) || response.includes(`${tagStr} BAD`)) {
        socket.removeListener('data', onData);
        if (response.includes(`${tagStr} NO`) || response.includes(`${tagStr} BAD`)) {
          reject(new Error(`IMAP error: ${response.trim()}`));
        } else {
          resolve(response);
        }
      }
    };

    socket.on('data', onData);
    socket.write(`${tagStr} ${command}\r\n`);

    // Timeout after 30s
    setTimeout(() => {
      socket.removeListener('data', onData);
      reject(new Error(`IMAP command timeout: ${command}`));
    }, 30000);
  });
}

function waitForGreeting(socket) {
  return new Promise((resolve, reject) => {
    let greeting = '';
    const onData = (data) => {
      greeting += data.toString();
      if (greeting.includes('* OK')) {
        socket.removeListener('data', onData);
        resolve(greeting);
      }
    };
    socket.on('data', onData);
    setTimeout(() => {
      socket.removeListener('data', onData);
      reject(new Error('IMAP greeting timeout'));
    }, 10000);
  });
}

async function checkInbox(account) {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: config.imapHost,
      port: config.imapPort,
      rejectUnauthorized: false,
    }, async () => {
      let tag = 1;
      const results = { bounces: 0, unsubscribes: 0, errors: [] };

      try {
        // Wait for greeting
        await waitForGreeting(socket);

        // Login
        await imapCommand(socket, tag++, `LOGIN "${account.smtp_user}" "${account.smtp_pass}"`);

        // Select INBOX
        const selectResp = await imapCommand(socket, tag++, 'SELECT INBOX');

        // Search for UNSEEN messages
        let searchResp;
        try {
          searchResp = await imapCommand(socket, tag++, 'SEARCH UNSEEN');
        } catch {
          // No unseen messages
          searchResp = '';
        }

        // Parse message UIDs
        const match = searchResp.match(/\* SEARCH ([\d\s]+)/);
        const uids = match ? match[1].trim().split(/\s+/).map(Number).filter(Boolean) : [];

        if (uids.length === 0) {
          await imapCommand(socket, tag++, 'LOGOUT');
          socket.destroy();
          return resolve(results);
        }

        console.log(`[imap] ${account.email}: Found ${uids.length} unseen messages`);

        // Fetch each message header
        for (const uid of uids.slice(0, 50)) { // Limit to 50 per poll
          try {
            const fetchResp = await imapCommand(
              socket, tag++,
              `FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`
            );

            const subjectMatch = fetchResp.match(/Subject:\s*(.+)/i);
            const fromMatch = fetchResp.match(/From:\s*(.+)/i);
            const subject = subjectMatch ? subjectMatch[1].trim() : '';
            const from = fromMatch ? fromMatch[1].trim() : '';

            // Check for bounce NDRs
            const isBounce = /undeliverable|delivery.*fail|returned.*mail|mailer-daemon|bounce/i.test(subject) ||
                            /mailer-daemon|postmaster/i.test(from);

            // Check for unsubscribe requests
            const isUnsubscribe = /\bstop\b|\bunsubscribe\b|\bremove\b|\bopt.?out\b/i.test(subject);

            if (isBounce) {
              // Try to extract the bounced email from the subject or body
              const emailMatch = fetchResp.match(/[\w.+-]+@[\w.-]+\.\w+/);
              if (emailMatch) {
                const bouncedEmail = emailMatch[0].toLowerCase();
                const contact = get('SELECT id, bounce_count FROM contacts WHERE email = ?', bouncedEmail);
                if (contact) {
                  run(
                    `UPDATE contacts SET bounce_count = bounce_count + 1, last_bounce_at = datetime('now') WHERE id = ?`,
                    contact.id
                  );
                  if (contact.bounce_count >= 2) { // Will be 3 after this increment
                    run(
                      `UPDATE contacts SET global_optout = 1, optout_date = datetime('now') WHERE id = ? AND global_optout = 0`,
                      contact.id
                    );
                  }
                  results.bounces++;
                }
              }

              // Mark as read
              await imapCommand(socket, tag++, `STORE ${uid} +FLAGS (\\Seen)`);
            }

            if (isUnsubscribe) {
              // Extract sender email
              const senderMatch = from.match(/[\w.+-]+@[\w.-]+\.\w+/);
              if (senderMatch) {
                const senderEmail = senderMatch[0].toLowerCase();

                // Check if subject says "STOP {list}" or just "STOP ALL"
                const stopMatch = subject.match(/stop\s+(\S+)/i);
                const listSlug = stopMatch ? stopMatch[1].toLowerCase() : null;

                if (listSlug && listSlug !== 'all') {
                  // List-specific unsubscribe
                  const list = get('SELECT id FROM lists WHERE slug = ?', listSlug);
                  const contact = get('SELECT id FROM contacts WHERE email = ?', senderEmail);
                  if (list && contact) {
                    run(
                      `UPDATE list_members SET subscribed = 0, unsubscribed_at = datetime('now')
                       WHERE contact_id = ? AND list_id = ?`,
                      contact.id, list.id
                    );
                  }
                } else {
                  // Global unsubscribe
                  const contact = get('SELECT id FROM contacts WHERE email = ?', senderEmail);
                  if (contact) {
                    run(
                      `UPDATE contacts SET global_optout = 1, optout_date = datetime('now') WHERE id = ?`,
                      contact.id
                    );
                    run(
                      `UPDATE list_members SET subscribed = 0, unsubscribed_at = datetime('now')
                       WHERE contact_id = ?`,
                      contact.id
                    );
                  }
                }
                results.unsubscribes++;
              }

              // Mark as read
              await imapCommand(socket, tag++, `STORE ${uid} +FLAGS (\\Seen)`);
            }
          } catch (fetchErr) {
            results.errors.push({ uid, error: fetchErr.message });
          }
        }

        await imapCommand(socket, tag++, 'LOGOUT');
      } catch (err) {
        results.errors.push({ error: err.message });
      }

      socket.destroy();
      resolve(results);
    });

    socket.on('error', (err) => {
      reject(new Error(`IMAP connection error for ${account.email}: ${err.message}`));
    });
  });
}

// ── Poller ──

async function pollAllAccounts() {
  const accounts = all(
    "SELECT * FROM sender_accounts WHERE provider = 'bluehost' AND enabled = 1"
  );

  if (accounts.length === 0) return;

  console.log(`[imap] Polling ${accounts.length} accounts for bounces/unsubscribes...`);

  let totalBounces = 0;
  let totalUnsubscribes = 0;

  for (const account of accounts) {
    try {
      const results = await checkInbox(account);
      totalBounces += results.bounces;
      totalUnsubscribes += results.unsubscribes;

      if (results.bounces > 0 || results.unsubscribes > 0) {
        console.log(`[imap] ${account.email}: ${results.bounces} bounces, ${results.unsubscribes} unsubscribes`);
      }

      if (results.errors.length > 0) {
        console.error(`[imap] ${account.email}: ${results.errors.length} errors`);
      }
    } catch (err) {
      console.error(`[imap] Error polling ${account.email}: ${err.message}`);
    }
  }

  if (totalBounces > 0 || totalUnsubscribes > 0) {
    console.log(`[imap] Poll complete: ${totalBounces} bounces, ${totalUnsubscribes} unsubscribes`);
  }
}

export function startImapPoller() {
  if (pollInterval) return;

  console.log(`[imap] Starting IMAP poller (every ${config.imapPollIntervalMs / 60000} min)`);

  // Initial poll after 60s (let everything warm up)
  setTimeout(() => {
    pollAllAccounts().catch(err => console.error('[imap] Initial poll error:', err.message));
  }, 60000);

  // Recurring poll
  pollInterval = setInterval(() => {
    pollAllAccounts().catch(err => console.error('[imap] Poll error:', err.message));
  }, config.imapPollIntervalMs);
}

export function stopImapPoller() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[imap] IMAP poller stopped');
  }
}

export default { startImapPoller, stopImapPoller };
