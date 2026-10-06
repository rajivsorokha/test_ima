const BREEDS = ['Friesian', 'Ayrshire', 'Jersey', 'Guernsey', 'Holstein', 'Crossbreed'];

async function renderCows(view) {
  const farms = await apiGet('/farms');
  let search = '', status = 'All Statuses', breed = 'All Breeds', farmFilter = '';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Cow Management</h1><p class="subtitle">Status Report of Dairy Cattle — Date/A.I./E.D.C. are pulled automatically from Health Events; Present Production from Milk Recording.</p></div>
      <button class="primary" id="addCowBtn">+ Add Cow</button>
    </div>
    <div class="toolbar">
      <input type="search" id="searchInput" placeholder="Search tag or name..." />
      <select id="statusFilter"><option>All Statuses</option><option>Active</option><option>Dry</option><option>Sold</option><option>Deceased</option></select>
      <select id="breedFilter"><option>All Breeds</option>${BREEDS.map(b => `<option>${b}</option>`).join('')}</select>
      <select id="farmFilter"><option value="">All Locations</option>${farms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select>
    </div>
    <div class="card" style="overflow-x:auto;"><table>
      <thead><tr>
        <th>No.</th><th>Breed</th><th>Age</th><th>Name</th><th>Ear Tag</th>
        <th>No. of Calving</th><th>Date of Calving</th><th>Present Production</th>
        <th>Date of A.I.</th><th>E.D.C.</th><th>Optimum Yield</th>
        <th>Farm</th><th>Status</th><th></th>
      </tr></thead>
      <tbody id="cowRows"></tbody>
    </table></div>
  `;

  const farmById = Object.fromEntries(farms.map(f => [f.id, f.name]));

  async function load() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status !== 'All Statuses') params.set('status', status);
    if (breed !== 'All Breeds') params.set('breed', breed);
    if (farmFilter) params.set('farm_id', farmFilter);
    const cows = await apiGet('/cows?' + params.toString());
    const rows = document.getElementById('cowRows');
    rows.innerHTML = cows.length ? cows.map((c, i) => `
      <tr>
        <td>${i + 1}</td><td>${c.breed}</td>
        <td>${c.age != null ? c.age + ' yrs' : '-'}</td>
        <td>${c.name || '-'}</td><td>${c.tag}</td>
        <td>${c.no_of_calving ?? 0}</td>
        <td>${c.last_calving_date ? fmtDate(c.last_calving_date) : '-'}</td>
        <td>${c.present_production != null ? fmtLiters(c.present_production) + '/day' : '-'}</td>
        <td>${c.last_ai_date ? fmtDate(c.last_ai_date) : '-'}</td>
        <td>${c.edc ? fmtDate(c.edc) : '-'}</td>
        <td>${c.optimum_yield != null ? fmtLiters(c.optimum_yield) + '/day' : '-'}</td>
        <td>${farmById[c.farm_id] || '-'}</td>
        <td><span class="pill ${pillClass(c.status)}">${c.status}</span></td>
        <td><button class="small editBtn" data-id="${c.id}">Edit</button> <button class="small danger delBtn" data-id="${c.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="14"><div class="empty-state">No cows found.</div></td></tr>`;

    rows.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', () => editCow(cows.find(c => c.id == b.dataset.id))));
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Delete this cow record?')) { await apiDelete(`/cows/${b.dataset.id}`); toast('Cow deleted'); load(); }
    }));
  }

  function cowFields(c = {}) {
    return [
      { name: 'farm_id', label: 'Farm / Location', type: 'select', required: true, value: c.farm_id,
        options: farms.map(f => ({ value: f.id, label: f.name })) },
      { name: 'tag', label: 'Ear Tag No.', required: true, value: c.tag },
      { name: 'name', label: 'Name of Cow', value: c.name },
      { name: 'breed', label: 'Type of Breed', type: 'select', value: c.breed, options: BREEDS.map(b => ({ value: b, label: b })) },
      { name: 'date_of_birth', label: 'Date of Birth', type: 'date', value: c.date_of_birth },
      { name: 'no_of_calving', label: 'No. of Calving', type: 'number', value: c.no_of_calving ?? 0 },
      { name: 'optimum_yield', label: 'Optimum Yield (liters/day)', type: 'number', step: '0.1', value: c.optimum_yield },
      { name: 'status', label: 'Status', type: 'select', value: c.status || 'Active',
        options: ['Active', 'Dry', 'Sold', 'Deceased'].map(s => ({ value: s, label: s })) },
    ];
  }

  function editCow(c) {
    openModal({
      title: 'Edit Cow', fields: cowFields(c), submitLabel: 'Save Changes',
      extraHtml: `<p class="desc">Date of Calving, Date of A.I., and E.D.C. are not editable here — log a "Calving" or "Insemination" event in Health Events instead, and they'll update automatically.</p>`,
      onSubmit: async (data, overlay) => { await apiPut(`/cows/${c.id}`, data); overlay.remove(); toast('Cow updated'); load(); }
    });
  }

  document.getElementById('addCowBtn').addEventListener('click', () => {
    openModal({
      title: 'Add Cow', fields: cowFields(), submitLabel: 'Add Cow',
      onSubmit: async (data, overlay) => { await apiPost('/cows', data); overlay.remove(); toast('Cow added'); load(); }
    });
  });

  document.getElementById('searchInput').addEventListener('input', (e) => { search = e.target.value; load(); });
  document.getElementById('statusFilter').addEventListener('change', (e) => { status = e.target.value; load(); });
  document.getElementById('breedFilter').addEventListener('change', (e) => { breed = e.target.value; load(); });
  document.getElementById('farmFilter').addEventListener('change', (e) => { farmFilter = e.target.value; load(); });

  load();
}
