const dateInput = document.getElementById('date');
const datePicker = document.getElementById('datePicker');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const accuracyInput = document.getElementById('locationAccuracy');
const locationStatus = document.getElementById('locationStatus');
const locateBtn = document.getElementById('locateBtn');
const clearPinBtn = document.getElementById('clearPinBtn');
let locationMap = null;
let locationMarker = null;
let accuracyCircle = null;
const noPinMessage ="No pin yet. That's OK: we'll use the address above.";
const popupMode = new URLSearchParams(window.location.search).get('popup') === '1';

if (typeof L !== 'undefined') {
  locationMap = L.map('locationMap', { scrollWheelZoom: false }).setView([14.4445, 120.9939], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(locationMap);
  locationMap.on('click', (event) => setLocationPin(event.latlng.lat, event.latlng.lng));
  locationStatus.textContent = noPinMessage;
} else {
  document.getElementById('locationMap').hidden = true;
  locationStatus.textContent = 'The map could not load. You can still submit the address above.';
}

function setLocationPin(lat, lng, accuracy = null) {
  if (!locationMap) return;
  latitudeInput.value = Number(lat).toFixed(7);
  longitudeInput.value = Number(lng).toFixed(7);
  accuracyInput.value = accuracy ? Math.round(accuracy) : '';
  const point = [Number(lat), Number(lng)];
  if (!locationMarker) {
    locationMarker = L.marker(point, { draggable: true, autoPan: true, title: 'Drag me onto your home' }).addTo(locationMap);
    locationMarker.on('dragend', (event) => {
      const pin = event.target.getLatLng();
      setLocationPin(pin.lat, pin.lng);
    });
  } else locationMarker.setLatLng(point);
  if (accuracyCircle) { accuracyCircle.remove(); accuracyCircle = null; }
  if (accuracy) accuracyCircle = L.circle(point, { radius: accuracy, color: '#1f5fd1', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(locationMap);
  locationMap.setView(point, Math.max(locationMap.getZoom(), accuracy > 200 ? 16 : 18));
  clearPinBtn.hidden = false;
  const coordinates = `${latitudeInput.value}, ${longitudeInput.value}`;
  locationStatus.classList.toggle('warn', accuracy > 100);
  locationStatus.innerHTML = accuracy
    ? `Location set from GPS (accurate to about <b>${Math.round(accuracy)} m</b>). Drag the pin to your exact address if needed.<small>${coordinates}</small>`
    : `Location set. Drag the pin or tap the map to adjust it.<small>${coordinates}</small>`;
}

function clearLocationPin() {
  latitudeInput.value = longitudeInput.value = accuracyInput.value = '';
  if (locationMarker) { locationMarker.remove(); locationMarker = null; }
  if (accuracyCircle) { accuracyCircle.remove(); accuracyCircle = null; }
  clearPinBtn.hidden = true;
  locationStatus.classList.remove('warn');
  locationStatus.textContent = noPinMessage;
}

locateBtn.addEventListener('click', () => {
  if (!window.isSecureContext || !navigator.geolocation) {
    locationStatus.classList.add('warn');
    locationStatus.textContent = 'This page cannot use GPS. Tap the map to place the pin instead.';
    return;
  }
  locateBtn.disabled = true;
  locateBtn.textContent = 'Finding you…';
  locationStatus.classList.remove('warn');
  locationStatus.textContent = 'Getting your location… If asked, allow location access.';
  const finish = () => { locateBtn.disabled = false; locateBtn.textContent = '◎ Use my current location'; };
  navigator.geolocation.getCurrentPosition(
    (position) => { finish(); setLocationPin(position.coords.latitude, position.coords.longitude, position.coords.accuracy); },
    (error) => {
      finish();
      locationStatus.classList.add('warn');
      locationStatus.textContent = error.code === 1
        ? 'Location access was blocked. Allow location for this site, or tap the map to place the pin.'
        : 'We could not get your GPS location. Try again near a window, or tap the map to place the pin.';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
});
clearPinBtn.addEventListener('click', clearLocationPin);

dateInput.addEventListener('input', () => {
  const digits = dateInput.value.replace(/\D/g, '').slice(0, 8);
  dateInput.value = digits.length < 3 ? digits : digits.length < 5
    ? `${digits.slice(0, 2)}/${digits.slice(2)}`
    : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  dateInput.setCustomValidity('');
});

datePicker.addEventListener('change', () => {
  if (!datePicker.value) return;
  const [year, month, day] = datePicker.value.split('-');
  dateInput.value = `${month}/${day}/${year}`;
  dateInput.setCustomValidity('');
});

dateInput.closest('.date-control').querySelector('svg').addEventListener('click', () => {
  if (datePicker.showPicker) datePicker.showPicker();
  else datePicker.click();
});

document.getElementById('cleaningForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  if (popupMode) {
    const batchField = document.getElementById('scheduleBatchField');
    const batchValue = document.getElementById('batch').value;
    batchField.classList.toggle('invalid', !batchValue);
    document.getElementById('batchError').textContent = batchValue ? '' : 'Pick a batch.';
    if (!batchValue) { batchField.querySelector('[data-batch]').focus(); return; }
  }
  const match = dateInput.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const validDate = match && new Date(+match[3], +match[1] - 1, +match[2]);
  dateInput.setCustomValidity(validDate && validDate.getFullYear() === +match[3] && validDate.getMonth() === +match[1] - 1 && validDate.getDate() === +match[2]
    ? '' : 'Enter the date as MM/DD/YYYY.');
  if (!this.reportValidity()) return;
  const form = this;
  const data = new FormData(form);
  // Reference number AGC#0001, AGC#0002 … from the online counter (supabase/request_numbers.sql).
  // Counter not set up or offline: a temporary number that won't repeat, e.g. AGC#K3F9Q2
  const submitBtn = form.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  let requestNo = '';
  if (!popupMode && typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined') {   // office booking: no request saved, no number used
    try {
      const counter = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
      const { data: no, error } = await counter.rpc('next_request_no', { kind: 'cleaning' });
      if (!error && no) requestNo = no;
    } catch {}
  }
  if (!requestNo) requestNo = 'AGC#' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 4)).toUpperCase().slice(-6);
  submitBtn.disabled = false;
  const record = {
    no: requestNo,
    created_at: new Date().toISOString(),
    date: `${match[3]}-${match[1]}-${match[2]}`,
    name: String(data.get('name') || '').trim(),
    address: String(data.get('address') || '').trim(),
    landmark: String(data.get('landmark') || '').trim(),
    brand_hp: String(data.get('brandHp') || '').trim(),
    contact: String(data.get('contact') || '').trim(),
    payment: String(data.get('payment') || ''),
    note: String(data.get('note') || '').trim(),
    latitude: latitudeInput.value ? Number(latitudeInput.value) : null,
    longitude: longitudeInput.value ? Number(longitudeInput.value) : null,
    location_accuracy: accuracyInput.value ? Number(accuracyInput.value) : null,
    status: 'New'
  };
  const btn = form.querySelector('[type="submit"]');
  if (popupMode) {
    btn.disabled = true;
    btn.textContent = 'SETTING CLEANING SCHEDULE…';
    window.parent.postMessage({ type: 'aircon-cleaning-submitted', request: { ...record, batch: String(data.get('batch') || '1ST BATCH') } }, window.location.origin);
    return;
  }
  btn.disabled = true;
  btn.textContent = 'SAVING…';
  const savePendingLocal = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('aircon_cleaning_requests') || '[]');
      saved.unshift({ ...record, sync_state: 'pending' });
      localStorage.setItem('aircon_cleaning_requests', JSON.stringify(saved));
    } catch {}
  };
  const removeLocalCopy = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('aircon_cleaning_requests') || '[]');
      localStorage.setItem('aircon_cleaning_requests', JSON.stringify(saved.filter((item) => item.no !== record.no)));
    } catch {}
  };
  try {
    savePendingLocal();
  } catch {}
  const finish = (statusText) => {
    document.getElementById('doneRequestNo').textContent = requestNo;
    document.getElementById('doneStatus').textContent = statusText;
    form.hidden = true;
    document.getElementById('doneScreen').hidden = false;
  };
  if (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined') {
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    try {
      const { error } = await db.from('cleaning_requests').insert(record);
      if (error) finish('Saved on this device. Shared records require the cleaning_requests database setup.');
      else { removeLocalCopy(); finish(''); }
    } catch {
      finish('Saved on this device. Shared records could not be reached.');
    }
  } else finish('Saved on this device.');
});

if (popupMode) {
  document.body.classList.add('schedule-popup');
  const intro = document.querySelector('.brand > p');
  if (intro) intro.textContent = 'Review the customer details, choose a cleaning date and service batch, then set the schedule.';
  document.getElementById('scheduleBatchField').hidden = false;
  document.querySelector('#cleaningForm .submit').textContent = 'SET CLEANING SCHEDULE';
  const batchField = document.getElementById('scheduleBatchField');
  batchField.addEventListener('click', (event) => {
    const option = event.target.closest('[data-batch]');
    if (!option) return;
    document.getElementById('batch').value = option.dataset.batch;
    batchField.querySelectorAll('[data-batch]').forEach((button) => button.setAttribute('aria-checked', String(button === option)));
    batchField.classList.remove('invalid');
    document.getElementById('batchError').textContent = '';
  });
  let prefill = {};
  try { prefill = JSON.parse(sessionStorage.getItem('aircon_cleaning_prefill') || '{}'); } catch {}
  if (prefill.name) document.getElementById('name').value = prefill.name;
  if (prefill.contact) document.getElementById('contact').value = prefill.contact;
  if (prefill.address) document.getElementById('address').value = prefill.address;
  if (prefill.landmark) document.getElementById('landmark').value = prefill.landmark;
  if (prefill.brand_hp) document.getElementById('brandHp').value = prefill.brand_hp;
  if (prefill.payment) document.getElementById('payment').value = prefill.payment;
  if (prefill.note) document.getElementById('note').value = prefill.note;
  if (prefill.date && /^\d{4}-\d{2}-\d{2}$/.test(prefill.date)) {
    const [year, month, day] = prefill.date.split('-');
    dateInput.value = `${month}/${day}/${year}`;
    datePicker.value = prefill.date;
  }
  if (prefill.latitude != null && prefill.longitude != null) {
    setLocationPin(prefill.latitude, prefill.longitude, prefill.location_accuracy || null);
    setTimeout(() => locationMap && locationMap.invalidateSize(), 100);
  }
}
