import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LOCAL, save, read } from './store.mjs';
export const catalog = [
  {
    id: 'google',
    name: 'Google Workspace',
    category: 'Email · calendar · documents',
    fields: ['GOOGLE_ACCESS_TOKEN'],
    help: 'Use a Google OAuth access token with Gmail read-only, Calendar read-only, and Drive metadata read-only scopes. Tokens expire; this adapter reports expiry and does not silently refresh.',
  },
  {
    id: 'microsoft',
    name: 'Microsoft 365',
    category: 'Email · calendar · documents',
    fields: ['MICROSOFT_ACCESS_TOKEN'],
    help: 'Use a Microsoft Graph delegated token with Mail.Read, Calendars.Read, Files.Read. Token renewal must be configured separately.',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Communications',
    fields: ['SLACK_TOKEN', 'SLACK_CHANNEL_ID'],
    help: 'Use a Slack token authorized for the selected channel and conversations.history. Import is read-only.',
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    category: 'Tasks · projects',
    fields: ['CLICKUP_TOKEN', 'CLICKUP_LIST_ID'],
    help: 'Use a personal ClickUp token and a list ID you can access.',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'Videos · community pulse',
    fields: ['YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID'],
    help: 'Use a YouTube Data API v3 key and a channel ID. Imports channel statistics and recent public video metadata. Transcript files can be imported separately.',
  },
  {
    id: 'fathom',
    name: 'Fathom',
    category: 'Meetings · transcripts',
    fields: [],
    help: 'Import a Fathom transcript or summary export through Capture → Import file. Direct authenticated synchronization is pending account setup.',
  },
  {
    id: 'skool',
    name: 'Skool',
    category: 'Community pulse',
    fields: [],
    help: 'Import a community export or use an authorized browser session in Codex. No direct API connection is configured.',
  },
  {
    id: 'files',
    name: 'Local files',
    category: 'Notes · meetings · video transcripts',
    fields: [],
    help: 'Import Markdown, text, JSON, or iCalendar files through Capture. Files are saved in your knowledge repository.',
  },
];
async function config() {
  try {
    return JSON.parse(
      await fs.readFile(path.join(LOCAL, 'connections.json'), 'utf8'),
    );
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}
async function states() {
  try {
    return JSON.parse(
      await fs.readFile(path.join(LOCAL, 'connection-status.json'), 'utf8'),
    );
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}
export async function connections() {
  const cfg = await config(),
    state = await states();
  return catalog.map((c) => ({
    ...c,
    status:
      c.id === 'files' ? 'available' : state[c.id]?.status || 'not-connected',
    lastSync: state[c.id]?.lastSync || null,
    error: state[c.id]?.error || null,
    count: state[c.id]?.count || 0,
    configured:
      c.fields.length > 0 &&
      c.fields.every((f) => Boolean(cfg[f] || process.env[f])),
  }));
}
export async function configure(id, values) {
  const c = catalog.find((c) => c.id === id);
  if (!c || !c.fields.length)
    throw new Error('This connection uses file import or Codex browser access');
  const cfg = await config();
  for (const key of c.fields)
    if (typeof values[key] === 'string' && values[key].trim())
      cfg[key] = values[key].trim();
  await fs.writeFile(
    path.join(LOCAL, 'connections.json'),
    JSON.stringify(cfg, null, 2),
    { mode: 0o600 },
  );
  return { saved: true };
}
const hashId = (s) => createHash('sha256').update(s).digest('hex');
async function json(url, headers = {}) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      'Provider returned HTTP ' +
        response.status +
        (response.status === 401 ? ' (token expired or unauthorized)' : ''),
    );
  const data = await response.json();
  if (data.ok === false)
    throw new Error('Provider rejected request: ' + data.error);
  return data;
}
async function ingest(
  provider,
  external,
  title,
  body,
  kind = 'source',
  due = '',
  area = 'knowledge',
) {
  const id = provider + '-' + hashId(String(external));
  let old;
  try {
    old = await read(id);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (old && old.body === body && old.title === title && old.due === due)
    return;
  await save(
    {
      id,
      title: title.slice(0, 200) || provider + ' item',
      body,
      kind,
      area,
      due,
      status: 'unconfirmed',
      source: provider + ': ' + external,
      links: old?.links || [],
    },
    old?.revision,
  );
}
export async function sync(id) {
  const c = catalog.find((c) => c.id === id);
  if (!c?.fields.length) throw new Error('Use file import for this source');
  const cfg = { ...process.env, ...(await config()) };
  if (!c.fields.every((k) => cfg[k]))
    throw new Error('Complete the connection settings first');
  let count = 0;
  const add = async (...a) => {
    await ingest(id, ...a);
    count++;
  };
  try {
    if (id === 'slack') {
      let cursor = '';
      do {
        const d = await json(
          'https://slack.com/api/conversations.history?limit=100&channel=' +
            encodeURIComponent(cfg.SLACK_CHANNEL_ID) +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          { Authorization: 'Bearer ' + cfg.SLACK_TOKEN },
        );
        for (const m of d.messages || [])
          await add(
            m.ts,
            (m.text || 'Slack message').slice(0, 90),
            m.text || '',
            'source',
            '',
            'work',
          );
        cursor = d.response_metadata?.next_cursor || '';
      } while (cursor && count < 500);
    }
    if (id === 'clickup') {
      for (let page = 0; page < 5; page++) {
        const d = await json(
          'https://api.clickup.com/api/v2/list/' +
            encodeURIComponent(cfg.CLICKUP_LIST_ID) +
            '/task?include_closed=false&page=' +
            page,
          { Authorization: cfg.CLICKUP_TOKEN },
        );
        for (const t of d.tasks || [])
          await add(
            t.id,
            t.name,
            (t.description || '') +
              '\n\nProvider status: ' +
              t.status?.status +
              '\nSource: ' +
              t.url,
            'task',
            t.due_date ? new Date(Number(t.due_date)).toISOString() : '',
            'business',
          );
        if (d.last_page || !(d.tasks || []).length) break;
      }
    }
    if (id === 'google') {
      const headers = { Authorization: 'Bearer ' + cfg.GOOGLE_ACCESS_TOKEN };
      const events = await json(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=100&timeMin=' +
          encodeURIComponent(new Date().toISOString()),
        headers,
      );
      for (const e of events.items || [])
        await add(
          e.id,
          e.summary || 'Calendar event',
          (e.description || '') + '\n\n' + (e.htmlLink || ''),
          'event',
          e.start?.dateTime || e.start?.date || '',
          'personal',
        );
      const mail = await json(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25',
        headers,
      );
      for (const m of mail.messages || []) {
        const d = await json(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
            m.id +
            '?format=metadata',
          headers,
        );
        await add(
          m.id,
          d.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject')
            ?.value || 'Email',
          JSON.stringify(d.payload?.headers || [], null, 2) +
            '\n\n' +
            (d.snippet || ''),
          'source',
          '',
          'work',
        );
      }
      const drive = await json(
        'https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,webViewLink,modifiedTime)&q=trashed%3Dfalse',
        headers,
      );
      for (const f of drive.files || [])
        await add(
          f.id,
          f.name,
          'Document link: ' +
            (f.webViewLink || '') +
            '\nLast changed: ' +
            f.modifiedTime,
        );
    }
    if (id === 'microsoft') {
      const headers = { Authorization: 'Bearer ' + cfg.MICROSOFT_ACCESS_TOKEN };
      for (const [endpoint, kind] of [
        ['messages?$top=25&$select=id,subject,bodyPreview,webLink', 'source'],
        [
          'events?$top=100&$select=id,subject,bodyPreview,start,webLink',
          'event',
        ],
      ]) {
        const d = await json(
          'https://graph.microsoft.com/v1.0/me/' + endpoint,
          headers,
        );
        for (const item of d.value || [])
          await add(
            item.id,
            item.subject || 'Microsoft item',
            (item.bodyPreview || '') + '\n\n' + item.webLink,
            kind,
            item.start?.dateTime || '',
            'work',
          );
      }
      const d = await json(
        'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100&$select=id,name,webUrl',
        headers,
      );
      for (const f of d.value || [])
        await add(f.id, f.name, 'Document link: ' + f.webUrl);
    }
    if (id === 'youtube') {
      const d = await json(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=' +
          encodeURIComponent(cfg.YOUTUBE_CHANNEL_ID) +
          '&key=' +
          encodeURIComponent(cfg.YOUTUBE_API_KEY),
      );
      for (const c of d.items || [])
        await add(
          c.id,
          c.snippet.title + ' · channel statistics',
          JSON.stringify(c.statistics, null, 2),
          'source',
          '',
          'business',
        );
      const videos = await json(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=25&channelId=' +
          encodeURIComponent(cfg.YOUTUBE_CHANNEL_ID) +
          '&key=' +
          encodeURIComponent(cfg.YOUTUBE_API_KEY),
      );
      for (const v of videos.items || [])
        await add(
          v.id.videoId,
          v.snippet.title,
          v.snippet.description +
            '\n\nhttps://www.youtube.com/watch?v=' +
            v.id.videoId,
        );
    }
    const state = await states();
    state[id] = {
      status: 'connected',
      lastSync: new Date().toISOString(),
      count,
      error: null,
    };
    await fs.writeFile(
      path.join(LOCAL, 'connection-status.json'),
      JSON.stringify(state, null, 2),
    );
    return { count };
  } catch (e) {
    const state = await states();
    state[id] = { ...state[id], status: 'error', error: e.message };
    await fs.writeFile(
      path.join(LOCAL, 'connection-status.json'),
      JSON.stringify(state, null, 2),
    );
    throw e;
  }
}
