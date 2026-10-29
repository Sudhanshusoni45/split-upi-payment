import { inject } from '@vercel/analytics';

// Initialize Vercel Analytics
inject();

const $ = (id) => document.getElementById(id);
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

// Everything in paise (integers) so we never lose a rupee to float rounding.
// Every payment is a whole-rupee amount except the last one, which carries the paise.
// Leftover rupees are spread ₹1 each over the first payments so nothing crosses the cap.
function split(totalPaise, capPaise) {
  const n = Math.max(1, Math.ceil(totalPaise / capPaise));
  if (n === 1) return [totalPaise];
  const base = Math.floor(totalPaise / n / 100) * 100;
  const rem = totalPaise - base * n;
  const extraRupees = Math.floor(rem / 100);
  const paise = rem % 100;
  return Array.from({ length: n }, (_, i) =>
    base + (i < extraRupees ? 100 : 0) + (i === n - 1 ? paise : 0)
  );
}

function mdr(totalPaise) {
  if (totalPaise <= 200000) return 0;
  return Math.min(Math.round(totalPaise * 0.004), 30000);
}

function upiLink(vpa, name, paise, note) {
  const p = new URLSearchParams({ pa: vpa, am: (paise / 100).toFixed(2), cu: 'INR' });
  if (name) p.set('pn', name);
  if (note) p.set('tn', note);
  return 'upi://pay?' + p.toString();
}

let lastLines = [];

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  run();
});

function run() {
  const total = Math.round(parseFloat($('amount').value) * 100);
  const cap = Math.floor(parseFloat($('cap').value)) * 100;
  if (!(total > 0) || !(cap > 0)) return;

  const vpa = $('vpa').value.trim();
  const name = $('name').value.trim();
  const chunks = split(total, cap);

  $('s-count').textContent = chunks.length;
  $('s-each').textContent = inr.format(chunks[0] / 100);
  $('s-saved').textContent = inr.format(mdr(total) / 100);

  const grid = $('chunks');
  grid.innerHTML = '';
  lastLines = [];

  if (chunks.length === 1) {
    grid.innerHTML = '<div class="card empty">Already ₹' + (cap / 100).toLocaleString('en-IN') + ' or under. No fee, no split needed.</div>';
  }

  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length === 1) break;
    const paise = chunks[i];
    const label = `Payment ${i + 1} of ${chunks.length}`;
    const note = `${i + 1}/${chunks.length}`;
    lastLines.push(`${label}: ${inr.format(paise / 100)}`);

    const el = document.createElement('div');
    el.className = 'card chunk';
    el.innerHTML = `
      <div class="n">${label}</div>
      <div class="amt">${inr.format(paise / 100)}</div>
      ${vpa ? '<div class="qr"></div>' : '<div class="hint">Add a UPI ID above to get a QR</div>'}
      <div class="actions">
        <button class="ghost" type="button" data-copy="${(paise / 100).toFixed(2)}">Copy amount</button>
        <button class="ghost" type="button" data-done>Paid</button>
      </div>`;
    grid.appendChild(el);

    if (vpa) el.querySelector('.qr').innerHTML = qrSvg(upiLink(vpa, name, paise, note));
  }

  const q = new URLSearchParams({ amount: (total / 100).toFixed(2) });
  if (vpa) q.set('vpa', vpa);
  if (name) q.set('name', name);
  if (cap !== 199900) q.set('cap', (cap / 100).toFixed(2));
  try { history.replaceState(null, '', '?' + q.toString()); } catch (_) {}

  $('result').classList.remove('hidden');
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Prefill from a shared link like ?amount=5000&vpa=shop@upi&name=Sharma
(function () {
  const q = new URLSearchParams(location.search);
  if (!q.get('amount')) return;
  $('amount').value = q.get('amount');
  if (q.get('vpa')) $('vpa').value = q.get('vpa');
  if (q.get('name')) $('name').value = q.get('name');
  if (q.get('cap')) $('cap').value = q.get('cap');
  run();
})();

$('chunks').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.copy) {
    navigator.clipboard.writeText(btn.dataset.copy).then(() => flash(btn, 'Copied'));
  } else if ('done' in btn.dataset) {
    btn.closest('.chunk').classList.toggle('done');
  }
});

$('copy-all').addEventListener('click', (e) => {
  navigator.clipboard.writeText(lastLines.join('\n')).then(() => flash(e.target, 'Copied'));
});

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}
