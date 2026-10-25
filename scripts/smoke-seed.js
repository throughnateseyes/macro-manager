// Fill a data folder with sample macros and a few months of history, so CI
// screenshots of the packaged app show something realistic.
//   node scripts/smoke-seed.js <data-dir>
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/smoke-seed.js <data-dir>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });

const snippets = [
  { title: 'Email Signature', abbr: 'sig', content: 'Best,\nAlex Rivera\nLeasing Team', pinned: true },
  {
    title: 'Tour Confirmation', abbr: 'tour', folder: 'Leasing', pinned: true, format: 'rich',
    content: 'Hi {field:Resident name},\n\nThanks for booking a tour of **unit {field:Unit}** on {date+2}. A few things before you come:\n\n- Street parking is free after 6 pm\n- Bring a photo ID\n- [Directions to the leasing office](https://maps.example.com/leasing)\n\nSee you then,\n{field:Agent}',
    fields: [{ label: 'Unit', choices: ['2A', '4B', '7C', '12F'] }, { label: 'Agent', default: 'Alex' }],
  },
  { title: 'Follow-up', abbr: 'fu', content: 'Hi {cursor}, just following up on my last note. Let me know if you have any questions!' },
  { title: 'Application Received', abbr: 'app', content: 'We received your application on {date} and will be in touch within 2 business days.', folder: 'Leasing' },
  { title: 'Office Address', abbr: 'addr', content: '123 Market St, Suite 400\nSan Francisco, CA 94103', folder: 'Leasing' },
  { title: 'Maintenance Reply', abbr: 'mr', content: 'Thanks for letting us know. A technician will reach out to schedule a visit.', folder: 'Residents' },
  { title: 'Zoom Link', abbr: 'zoom', content: 'https://zoom.us/j/1234567890' },
];
const usage = { sig: 342, tour: 458, fu: 231, app: 77, addr: 112, mr: 196, zoom: 41 };

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = {};
const abbrs = Object.keys(usage);
const d = new Date();
for (let i = 0; i < 140; i++) {
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const total = weekend ? 0 : 4 + ((i * 37) % 19);
  if (total) {
    const macros = {};
    for (let j = 0; j < total; j++) { const a = abbrs[(i + j * 3) % abbrs.length]; macros[a] = (macros[a] || 0) + 1; }
    days[dayKey(d)] = { total, macros };
  }
  d.setDate(d.getDate() - 1);
}
const now = Date.now();
const recent = [['fu', 2], ['mr', 65], ['addr', 26 * 60], ['zoom', 4 * 24 * 60]].map(([abbr, mins]) => ({ abbr, at: now - mins * 60000 }));
const stats = { lifetime: 1457, charsSaved: 118400, since: dayKey(new Date(now - 200 * 86400000)), days, recent };

const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
write('macros.json', { prefix: '/', snippets });
write('usage.json', usage);
write('stats.json', stats);
// Already set up, so the app doesn't try to register itself at login.
write('settings.json', { launchAtLoginInitialized: true });
console.log(`seeded ${snippets.length} macros into ${dir}`);
