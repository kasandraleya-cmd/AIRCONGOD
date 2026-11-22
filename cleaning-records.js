(() => {
  const LOCAL_KEY = 'aircon_cleaning_requests';
  const body = document.getElementById('recordsBody');
  const detail = document.getElementById('recordDetail');
  const message = document.getElementById('recordMessage');
  const search = document.getElementById('search');
  const pageModal = document.getElementById('pageModal');
  const pageFrame = document.getElementById('pageFrame');
  let selectedRequest = null;
  let selectedNo = '';
  let records = [];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const localRecords = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
  };
  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString('en-US');
  };
  const mapLink = (row) => row.latitude && row.longitude
    ? `https://www.google.com/maps?q=${encodeURIComponent(row.latitude + ',' + row.longitude)}` : '';
  const get = (row, ...keys) => {
    for (const key of keys) if (row[key] != null && row[key] !== '') return row[key];
    return '';
  };
  // Date filter (daterange.js): by the date the customer picked on the form, or the day it was sent
  const rowDay = (row) => (typeof DateRange !== "undefined" ? DateRange.day(row.date) || DateRange.day(row.created_at || row.submitted) : "");
  const dates = typeof DateRange !== "undefined"
    ? DateRange.filter({ dates: () => records.map(rowDay), onChange: () => draw(), title: "Show only the requests for these dates" })
    : null;
  if (dates) document.getElementById("refreshBtn").before(dates.el);

  function draw() {
    const query = search.value.trim().toLowerCase();
    const filtered = records.filter((row) => (!dates || dates.has(rowDay(row))) && [row.no, row.name, row.contact, row.address, row.landmark, row.brand_hp, row.brandHp, row.note]
      .some((value) => String(value || '').toLowerCase().includes(query)));
    document.getElementById('totalCount').textContent = records.length;
    document.getElementById('newCount').textContent = records.filter((row) => (row.status || 'New') === 'New').length;
    document.getElementById('doneCount').textContent = records.filter((row) => row.status === 'Completed').length;
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="3">${records.length ? 'No cleaning requests match your search or dates.' : 'No cleaning requests yet.'}</td></tr>`;
      detail.innerHTML = '<div class="cleaning-record-empty"><i class="fas fa-inbox"></i><p>Select a cleaning request to see its details.</p></div>';
      return;
    }
    body.innerHTML = filtered.map((row) => {
      const status = row.status || 'New';
      return `<tr>
        <td><button type="button" class="request-open${selectedNo === String(row.no || '') ? ' selected' : ''}" data-select-request="${escapeHtml(row.no || '')}">${escapeHtml(row.no || 'Local request')}</button><span class="subline">${escapeHtml(row.created_at ? new Date(row.created_at).toLocaleString() : '')}</span></td>
        <td><b>${escapeHtml(row.name || '—')}</b><span class="subline">${escapeHtml(formatDate(row.date))}</span></td>
        <td>${row.id ? `<select class="status-select" data-status="${escapeHtml(status)}" data-id="${escapeHtml(row.id)}"><option${status === 'New' ? ' selected' : ''}>New</option><option${status === 'Contacted' ? ' selected' : ''}>Contacted</option><option${status === 'Scheduled' ? ' selected' : ''}>Scheduled</option><option${status === 'Completed' ? ' selected' : ''}>Completed</option><option${status === 'Cancelled' ? ' selected' : ''}>Cancelled</option></select>` : `<span class="cr-pill" data-status="${escapeHtml(status)}">${escapeHtml(status)}</span>`}</td>
      </tr>`;
    }).join('');
    const selected = filtered.find((row) => String(row.no || '') === selectedNo) || filtered[0];
    if (selected) { selectedNo = String(selected.no || ''); showDetail(selected); }
    body.querySelectorAll('.status-select').forEach((select) => select.addEventListener('change', async () => {
      if (!window.cloud) { message.textContent = 'Status changes need the online database.'; return; }
      const { error } = await window.cloud.from('cleaning_requests').update({ status: select.value }).eq('id', Number(select.dataset.id));
      if (error) { message.className = 'cleaning-record-message error'; message.textContent = `Could not update status: ${error.message}`; return; }
      const row = records.find((item) => String(item.id) === select.dataset.id);
      if (row) row.status = select.value;
      message.className = 'cleaning-record-message'; message.textContent = 'Status updated.'; draw();
    }));
  }
  function showDetail(row) {
    selectedNo = String(row.no || '');
    const address = [row.address, row.landmark && `Landmark: ${row.landmark}`].filter(Boolean).join(' · ');
    const pin = mapLink(row);
    const fields = [
      ['Cleaning date', formatDate(row.date)], ['Contact number', row.contact],
      ['Unit', get(row, 'brand_hp', 'brandHp')], ['Mode of payment', row.payment],
      ['Address', address, true], ['Special note', row.note, true]
    ];
    detail.innerHTML = `<div class="cleaning-record-head"><span class="cleaning-record-avatar">${escapeHtml((row.name || '?').trim().charAt(0).toUpperCase())}</span><div><h2>${escapeHtml(row.name || 'Customer')}</h2><p><span>${escapeHtml(row.no || 'Cleaning request')}</span><span class="cr-pill" data-status="${escapeHtml(row.status || 'New')}">${escapeHtml(row.status || 'New')}</span></p></div></div>
      <div class="cleaning-record-actions"><span>Schedule this request in:</span><button type="button" class="cr-actions-button" data-detail-request="${escapeHtml(row.no || '')}"><i class="fas fa-calendar-alt"></i> Daily / Weekly Schedule</button></div>
      <div class="cleaning-record-info">${fields.map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ''}><small>${escapeHtml(label)}</small><b>${escapeHtml(value || '—')}</b></div>`).join('')}${pin ? `<div class="wide"><small>Location pin</small><a href="${pin}" target="_blank" rel="noopener"><i class="fas fa-map-marker-alt"></i> Open location pin</a></div>` : ''}</div>`;
    body.querySelectorAll('tr').forEach((tr) => {
      const button = tr.querySelector('[data-select-request]');
      tr.classList.toggle('on', !!button && button.dataset.selectRequest === selectedNo);
    });
  }
  // ---------- Daily / Weekly Schedule pop-up: the same form Customer Records opens, filled in ----------
  function closeRequest() {
    if (pageModal.hidden) return;
    pageModal.hidden = true;
    pageFrame.src = 'about:blank';
    sessionStorage.removeItem('aircon_cleaning_prefill');
    selectedRequest = null;
  }
  function showRequest(row) {
    selectedRequest = row;
    const unit = get(row, 'brand_hp', 'brandHp');
    sessionStorage.setItem('aircon_cleaning_prefill', JSON.stringify({
      name: row.name || '', contact: row.contact || '',
      address: row.address || '', landmark: row.landmark || '',
      landmark: row.landmark || '', brand_hp: unit, payment: row.payment || '', note: row.note || '', date: row.date || '',
      ...(row.latitude && row.longitude ? { latitude: +row.latitude, longitude: +row.longitude, location_accuracy: row.location_accuracy } : {}),
    }));
    document.getElementById('pageSub').innerHTML = `Pick the cleaning date and batch, then set the schedule for <b>${escapeHtml(row.name || 'this customer')}</b> (${escapeHtml(row.no || 'cleaning request')})`;
    document.getElementById('pageLoading').hidden = false;
    pageFrame.style.visibility = 'hidden';
    pageFrame.src = 'cleaning-form/index.html?popup=1';
    pageModal.hidden = false;
  }
  // Inside the pop-up the form shows only its own content (same as Customer Records)
  pageFrame.addEventListener('load', () => {
    if (!pageFrame.src || pageFrame.src === 'about:blank') return;
    try {
      const style = pageFrame.contentDocument.createElement('style');
      style.textContent = '.side, #chatLauncher, #cloudBadge { display: none !important; } body.app { display: block !important; min-height: 0 !important; } .content { padding: 18px 20px !important; }';
      pageFrame.contentDocument.head.appendChild(style);
    } catch (e) {}
    document.getElementById('pageLoading').hidden = true;
    pageFrame.style.visibility = '';
  });

  // Message at the top of the page after scheduling (same as Customer Records)
  function showBooked(html, bad) {
    let box = document.getElementById('bookedMsg');
    if (!box) { box = document.createElement('div'); box.id = 'bookedMsg'; box.className = 'cr-booked-msg'; document.body.appendChild(box); }
    box.classList.toggle('bad', !!bad);
    box.innerHTML = `<i class="fas ${bad ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i><span>${html}</span><button type="button" aria-label="Close">&times;</button>`;
    box.querySelector('button').onclick = () => box.remove();
  }

  function scheduleDaily(row, date, batch) {
    const all = JSON.parse(localStorage.getItem('aircon_daily') || '{}');
    const blank = () => ({ jo: '', time: '', name: '', location: '', model: '', hp: '', qty: '', status: '', mop: '', assign: '', notes: '', address: '' });
    const day = all[date] && Array.isArray(all[date].groups) ? all[date] : (all[date] = { groups: [
      { kind: 'installer', rows: Array.from({ length: 3 }, blank) }, { kind: 'installer', rows: Array.from({ length: 3 }, blank) },
      { kind: 'installer', rows: Array.from({ length: 3 }, blank) }, { kind: 'service', rows: Array.from({ length: 4 }, blank) },
    ] });
    const requestTag = `Cleaning request ${row.no}`;
    if (day.groups.some((group) => (group.rows || []).some((item) => String(item.notes || '').includes(requestTag)))) return false;
    let service = day.groups.find((group) => group.kind === 'service');
    if (!service) { service = { kind: 'service', rows: [] }; day.groups.push(service); }
    const slot = service.rows.find((item) => !String(item.name || '').trim()) || (service.rows.push(blank()), service.rows[service.rows.length - 1]);
    const mop = { 'gcash': 'G-CASH', 'bank transfer': 'BANK TRANSFER', 'credit card': 'CREDIT CARD', 'cash': 'CASH' }[String(row.payment || '').toLowerCase()] || '';
    Object.assign(slot, {
      time: batch, name: row.name || '', location: row.address || '', model: 'CLEANING ST', qty: '1', status: 'WAITING', mop,
      notes: [requestTag, row.contact, row.note].filter(Boolean).join(' / '), address: [row.address, row.landmark].filter(Boolean).join(' · '),
      pin: row.latitude && row.longitude ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}` : '',
    });
    localStorage.setItem('aircon_daily', JSON.stringify(all));
    return true;
  }

  function scheduleWeekly(row, date, batch) {
    const all = JSON.parse(localStorage.getItem('aircon_schedule') || '{}');
    const requestTag = `Cleaning request ${row.no}`;
    const existing = Object.entries(all).find(([key, entry]) => key.startsWith(`${date}|`) && String(entry.note || '').includes(requestTag));
    if (existing) return existing[0];
    let key = null;
    const section = { '1ST BATCH': 'mi', '2ND BATCH': 'ni' }[batch];
    if (section) for (let i = 0; i < 7 && !key; i++) if (!all[`${date}|${section}|${i}`]) key = `${date}|${section}|${i}`;
    if (!key) for (let i = 0; !key; i++) if (!all[`${date}|ph|${i}`]) key = `${date}|ph|${i}`;
    all[key] = {
      client: row.name || '', job: 'CLEANING ST', location: row.address || '', team: '', status: '', paid: '',
      note: [batch, requestTag, row.contact, row.note].filter(Boolean).join(' · '),
      pin: row.latitude && row.longitude ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}` : '',
    };
    localStorage.setItem('aircon_schedule', JSON.stringify(all));
    return key;
  }

  // The pop-up form's SET SCHEDULE: book the cleaning request with what the office entered in the form
  async function addToSchedules(original, r) {
    const date = r.date;
    const batch = r.batch || '1ST BATCH';
    // The form's details win (the office may have corrected them); the request number stays the same
    const row = {
      ...original, name: r.name || original.name, contact: r.contact || original.contact,
      address: r.address || original.address, landmark: r.landmark || original.landmark || '', note: r.note || '', payment: r.payment || original.payment,
      latitude: r.latitude ?? original.latitude, longitude: r.longitude ?? original.longitude,
    };
    showBooked('<i class="fas fa-spinner fa-spin"></i> Saving the schedule online…');
    try {
      if (window.cloudReady) await window.cloudReady;
      scheduleDaily(row, date, batch);
      scheduleWeekly(row, date, batch);
      if (window.cloudSaveNow) {
        const errors = (await Promise.all([window.cloudSaveNow('aircon_daily'), window.cloudSaveNow('aircon_schedule')])).filter(Boolean);
        if (errors.length) throw new Error(errors.join(' · '));
      }
      original.status = 'Scheduled';
      if (window.cloud && original.id) {
        const { error } = await window.cloud.from('cleaning_requests').update({ status: 'Scheduled' }).eq('id', Number(original.id));
        if (error) throw new Error(`Schedules saved, but request status could not be updated: ${error.message}`);
      }
      const local = localRecords();
      const localRow = local.find((item) => item.no === original.no);
      if (localRow) { localRow.status = 'Scheduled'; localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); }
      const day = new Date(`${date}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      showBooked(`<b>${escapeHtml(row.name)}</b> is booked on <b>${escapeHtml(day)}</b> · <b>${escapeHtml(batch)}</b> in Services of the Daily Schedule and the Weekly Schedule.`
        + `<span class="cr-booked-go"><a href="dailysched.html?date=${encodeURIComponent(date)}"><i class="fas fa-calendar-day"></i> Open Daily Schedule</a>`
        + `<a href="schedule.html?date=${encodeURIComponent(date)}"><i class="fas fa-calendar-alt"></i> Open Weekly Schedule</a></span>`);
      load();
    } catch (error) {
      showBooked(`<b>${escapeHtml(row.name)}</b> was NOT fully scheduled: ${escapeHtml(error.message)}`, true);
    }
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== pageFrame.contentWindow) return;
    const r = event.data && event.data.type === 'aircon-cleaning-submitted' && event.data.request;
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !selectedRequest) return;
    const original = selectedRequest;
    closeRequest();
    addToSchedules(original, r);
  });
  async function load() {
    message.className = 'cleaning-record-message';
    message.textContent = 'Loading records…';
    const local = localRecords();
    if (window.cloud) {
      const { data, error } = await window.cloud.from('cleaning_requests').select('*').order('created_at', { ascending: false });
      if (!error) {
        const onlineNos = new Set((data || []).map((row) => row.no));
        // Legacy local copies may outlive a cloud deletion. Only include records
        // explicitly marked pending after an unsuccessful/offline form submission.
        records = [...(data || []), ...local.filter((row) => row.sync_state === 'pending' && !onlineNos.has(row.no))];
        message.textContent = '';
      } else {
        records = local;
        message.className = 'cleaning-record-message error';
        message.textContent = local.length
          ? 'Showing records saved in this browser. Run supabase/cleaning_requests.sql to enable shared records.'
          : 'The shared cleaning records table is not ready. Run supabase/cleaning_requests.sql in Supabase.';
      }
    } else {
      records = local;
      message.textContent = 'Showing records saved in this browser.';
    }
    records.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    draw();
  }
  body.addEventListener('change', (event) => { if (event.target.matches('.status-select')) event.target.dataset.status = event.target.value; });
  search.addEventListener('input', draw);
  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-request]');
    if (!button) return;
    const row = records.find((item) => String(item.no || '') === button.dataset.selectRequest);
    if (row) { selectedNo = String(row.no || ''); draw(); }
  });
  detail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail-request]');
    if (!button) return;
    const row = records.find((item) => String(item.no || '') === button.dataset.detailRequest);
    if (row) showRequest(row);
  });
  document.getElementById('pageClose').addEventListener('click', closeRequest);
  pageModal.addEventListener('click', (event) => { if (event.target === pageModal) closeRequest(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeRequest(); });
  document.getElementById('refreshBtn').addEventListener('click', load);
  load();
  if (window.cloud) window.cloud.channel('cleaning_requests').on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_requests' }, load).subscribe();
})();
