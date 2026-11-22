(() => {
  const LOCAL_KEY = 'aircon_survey_requests';
  const body = document.getElementById('recordsBody');
  const detail = document.getElementById('recordDetail');
  const message = document.getElementById('recordMessage');
  const search = document.getElementById('search');
  let records = [];
  let selectedNo = '';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const localRecords = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
  };
  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString('en-US');
  };
  const mapLink = (row) => row.latitude != null && row.longitude != null
    ? `https://www.google.com/maps?q=${encodeURIComponent(row.latitude + ',' + row.longitude)}` : '';

  // Date filter (daterange.js): by the date the customer picked on the form, or the day it was sent
  const rowDay = (row) => (typeof DateRange !== "undefined" ? DateRange.day(row.date) || DateRange.day(row.created_at || row.submitted) : "");
  const dates = typeof DateRange !== "undefined"
    ? DateRange.filter({ dates: () => records.map(rowDay), onChange: () => draw(), title: "Show only the requests for these dates" })
    : null;
  if (dates) document.getElementById("refreshBtn").before(dates.el);

  function draw() {
    const query = search.value.trim().toLowerCase();
    const filtered = records.filter((row) => (!dates || dates.has(rowDay(row))) && [row.no, row.name, row.contact, row.contact_person, row.address, row.landmark, row.brand_hp, row.inverter_type, row.note]
      .some((value) => String(value || '').toLowerCase().includes(query)));
    document.getElementById('totalCount').textContent = records.length;
    document.getElementById('newCount').textContent = records.filter((row) => (row.status || 'New') === 'New').length;
    document.getElementById('doneCount').textContent = records.filter((row) => row.status === 'Completed').length;
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="3">${records.length ? 'No survey requests match your search or dates.' : 'No survey requests yet.'}</td></tr>`;
      detail.innerHTML = '<div class="cleaning-record-empty"><i class="fas fa-inbox"></i><p>Select a survey request to see its details.</p></div>';
      return;
    }
    body.innerHTML = filtered.map((row) => {
      const status = row.status || 'New';
      return `<tr>
        <td><button type="button" class="request-open${selectedNo === String(row.no || '') ? ' selected' : ''}" data-select-request="${escapeHtml(row.no || '')}">${escapeHtml(row.no || 'Survey request')}</button><span class="subline">${escapeHtml(row.created_at ? new Date(row.created_at).toLocaleString() : '')}</span></td>
        <td><b>${escapeHtml(row.name || '—')}</b><span class="subline">${escapeHtml(formatDate(row.date))}</span></td>
        <td><select class="status-select" data-status="${escapeHtml(status)}" data-status-no="${escapeHtml(row.no || '')}"${row.id ? ` data-id="${escapeHtml(row.id)}"` : ''}><option${status === 'New' ? ' selected' : ''}>New</option><option${status === 'Contacted' ? ' selected' : ''}>Contacted</option><option${status === 'Scheduled' ? ' selected' : ''}>Scheduled</option><option${status === 'Completed' ? ' selected' : ''}>Completed</option><option${status === 'Cancelled' ? ' selected' : ''}>Cancelled</option></select></td>
      </tr>`;
    }).join('');
    const selected = filtered.find((row) => String(row.no || '') === selectedNo) || filtered[0];
    selectedNo = String(selected.no || '');
    showDetail(selected);
    body.querySelectorAll('.status-select').forEach((select) => select.addEventListener('change', async () => {
      const row = records.find((item) => String(item.no || '') === select.dataset.statusNo);
      if (!row) return;
      if (row.id && window.cloud) {
        const { error } = await window.cloud.from('survey_requests').update({ status: select.value }).eq('id', Number(row.id));
        if (error) {
          message.className = 'cleaning-record-message error';
          message.textContent = `Could not update status: ${error.message}`;
          draw();
          return;
        }
      }
      row.status = select.value;
      if (!row.id) {
        const local = localRecords();
        const localRow = local.find((item) => item.no === row.no);
        if (localRow) { localRow.status = row.status; localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); }
      }
      message.className = 'cleaning-record-message';
      message.textContent = row.id ? 'Status updated.' : 'Status updated on this device.';
      draw();
    }));
  }

  function showDetail(row) {
    const address = [row.address, row.landmark && `Landmark: ${row.landmark}`].filter(Boolean).join(' · ');
    const pin = mapLink(row);
    const fields = [
      ['Survey date', formatDate(row.date)], ['Contact number', row.contact],
      ['Contact person', row.contact_person], ['Inverter type', row.inverter_type],
      ['Brand and HP', row.brand_hp], ['Mode of payment', row.payment],
      ['Address', address, true], ['Special note', row.note, true]
    ];
    detail.innerHTML = `<div class="cleaning-record-head"><span class="cleaning-record-avatar">${escapeHtml((row.name || '?').trim().charAt(0).toUpperCase())}</span><div><h2>${escapeHtml(row.name || 'Customer')}</h2><p><span>${escapeHtml(row.no || 'Survey request')}</span><span class="cr-pill" data-status="${escapeHtml(row.status || 'New')}">${escapeHtml(row.status || 'New')}</span></p></div></div>
      <div class="cleaning-record-info">${fields.map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ''}><small>${escapeHtml(label)}</small><b>${escapeHtml(value || '—')}</b></div>`).join('')}${pin ? `<div class="wide"><small>Location pin</small><a href="${pin}" target="_blank" rel="noopener"><i class="fas fa-map-marker-alt"></i> Open location pin</a></div>` : ''}</div>`;
    body.querySelectorAll('tr').forEach((tr) => {
      const button = tr.querySelector('[data-select-request]');
      tr.classList.toggle('on', !!button && button.dataset.selectRequest === String(row.no || ''));
    });
  }

  async function load() {
    message.className = 'cleaning-record-message';
    message.textContent = 'Loading survey records…';
    const local = localRecords();
    if (window.cloud) {
      const { data, error } = await window.cloud.from('survey_requests').select('*').order('created_at', { ascending: false });
      if (!error) {
        const remoteNos = new Set((data || []).map((row) => row.no));
        records = [...(data || []), ...local.filter((row) => !remoteNos.has(row.no))];
        message.textContent = '';
      } else {
        records = local;
        message.className = 'cleaning-record-message error';
        message.textContent = local.length
          ? 'Showing surveys saved in this browser. Run supabase/survey_requests.sql to enable shared records.'
          : 'The shared survey table is not ready. Run supabase/survey_requests.sql in Supabase.';
      }
    } else {
      records = local;
      message.textContent = 'Showing surveys saved in this browser.';
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
  document.getElementById('refreshBtn').addEventListener('click', load);
  load();
  if (window.cloud) window.cloud.channel('survey_requests').on('postgres_changes', { event: '*', schema: 'public', table: 'survey_requests' }, load).subscribe();
})();
