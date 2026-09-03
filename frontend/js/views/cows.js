const BREEDS = ['Friesian', 'Ayrshire', 'Jersey', 'Guernsey', 'Holstein', 'Crossbreed'];

async function renderCows(view) {
  const farms = await apiGet('/farms');
  let search = '', status = 'All Statuses', breed = 'All Breeds', farmFilter = '';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Cow Management</h1><p class="subtitle">Track and manage your herd across every location.</p></div>
      <button class="primary" id="addCowBtn">+ Add Cow</button>
    </div>
    <div class="toolbar">
      <input type="search" id="searchInput" placeholder="Search tag or name..." />
      <select id="statusFilter"><option>All Statuses</option><option>Active</option><option>Dry</option><option>Sold</option><option>Deceased</option></select>
      <select id="breedFilter"><option>All Breeds</option>${BREEDS.map(b => `<option>${b}</option>`).join('')}</select>
      <select id="farmFilter"><option value="">All Locations</option>${farms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select>
    </div>
    <div class="card"><table>
      <thead><tr><th>Tag</th><th>Name</th><th>Breed</th><th>Farm</th><th>Age</th><th>Status</th><th></th></tr></thead>
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
    rows.innerHTML = cows.length ? cows.map(c => `
      <tr>
        <td>${c.tag}</td><td>${c.name || '-'}</td><td>${c.breed}</td>
        <td>${farmById[c.farm_id] || '-'}</td>
        <td>${c.age != null ? c.age + ' yrs' : '-'}</td>
        <td><span class="pill ${pillClass(c.status)}">${c.status}</span></td>
        <td><button class="small editBtn" data-id="${c.id}">Edit</button> <button class="small danger delBtn" data-id="${c.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">No cows found.</div></td></tr>`;

    rows.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', () => editCow(cows.find(c => c.id == b.dataset.id))));
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Delete this cow record?')) { await apiDelete(`/cows/${b.dataset.id}`); toast('Cow deleted'); load(); }
    }));
  }

  function cowFields(c = {}) {
    return [
      { name: 'farm_id', label: 'Farm / Location', type: 'select', required: true, value: c.farm_id,
        options: farms.map(f => ({ value: f.id, label: f.name })) },
      { name: 'tag', label: 'Tag', required: true, value: c.tag },
      { name: 'name', label: 'Name', value: c.name },
      { name: 'breed', label: 'Breed', type: 'select', value: c.breed, options: BREEDS.map(b => ({ value: b, label: b })) },
      { name: 'date_of_birth', label: 'Date of Birth', type: 'date', value: c.date_of_birth },
      { name: 'status', label: 'Status', type: 'select', value: c.status || 'Active',
        options: ['Active', 'Dry', 'Sold', 'Deceased'].map(s => ({ value: s, label: s })) },
    ];
  }

  function editCow(c) {
    openModal({
      title: 'Edit Cow', fields: cowFields(c), submitLabel: 'Save Changes',
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
