const HEALTH_TYPES = ['Vaccination', 'Treatment', 'Deworming', 'Checkup', 'Surgery', 'Calving', 'Insemination'];

async function renderHealth(view) {
  const cows = await apiGet('/cows');
  let status = 'All';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Health Events</h1><p class="subtitle">Manage vaccinations, illnesses, vet visits, and post-A.I. monitoring across the herd.</p></div>
      <button class="primary" id="logEventBtn">+ Log Event</button>
    </div>
    <div class="tabs" id="healthTabs">
      <button data-t="events" class="active">All Events</button>
      <button data-t="ai">🐄 Post-A.I. Monitoring</button>
    </div>
    <div id="healthBody"></div>
  `;

  async function renderEventsTab() {
    document.getElementById('healthBody').innerHTML = `
      <div class="tabs" id="statusTabs">
        <button data-s="All" class="active">All</button>
        <button data-s="Open">Open</button>
        <button data-s="In Progress">In Progress</button>
        <button data-s="Resolved">Resolved</button>
      </div>
      <div class="card"><table>
        <thead><tr><th>Date</th><th>Cow</th><th>Type</th><th>Description</th><th>Vet</th><th>Cost</th><th>Status</th><th></th></tr></thead>
        <tbody id="healthRows"></tbody>
      </table></div>
    `;

    async function load() {
      const params = status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
      const events = await apiGet('/health-events' + params);
      const rows = document.getElementById('healthRows');
      rows.innerHTML = events.length ? events.map(h => `
        <tr>
          <td>${fmtDate(h.date)}</td><td>${h.cow_tag}</td><td>${h.type}</td><td>${h.description || '-'}</td>
          <td>${h.vet_name || '-'}</td><td>${h.cost ? fmtMoney(h.cost) : '-'}</td>
          <td><span class="pill ${pillClass(h.status)}">${h.status}</span></td>
          <td>
            ${h.status !== 'Resolved' ? `<button class="small nextBtn" data-id="${h.id}" data-next="${h.status === 'Open' ? 'In Progress' : 'Resolved'}">${h.status === 'Open' ? 'Start' : 'Resolve'}</button>` : `<button class="small reopenBtn" data-id="${h.id}">Reopen</button>`}
            <button class="small danger delBtn" data-id="${h.id}">Delete</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="8"><div class="empty-state">No health events found.</div></td></tr>`;

      rows.querySelectorAll('.nextBtn').forEach(b => b.addEventListener('click', async () => {
        await apiPut(`/health-events/${b.dataset.id}/status`, { status: b.dataset.next }); toast('Status updated'); load();
      }));
      rows.querySelectorAll('.reopenBtn').forEach(b => b.addEventListener('click', async () => {
        await apiPut(`/health-events/${b.dataset.id}/status`, { status: 'Open' }); toast('Reopened'); load();
      }));
      rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
        await apiDelete(`/health-events/${b.dataset.id}`); toast('Deleted'); load();
      }));
    }

    document.querySelectorAll('#statusTabs button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#statusTabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); status = b.dataset.s; load();
    }));

    load();
  }

  async function renderAiTab() {
    document.getElementById('healthBody').innerHTML = `
      <div class="card settings-section">
        <h2>Why keep watching a cow after A.I.?</h2>
        <p class="desc">
          Insemination day isn't the finish line — what happens over the following weeks tells you whether it worked.
          Three things are worth tracking for every bred cow: whether she comes back into heat, whether a vet
          confirms the pregnancy, and whether her milk yield behaves normally.
        </p>
        <table style="margin-top:10px;">
          <tbody>
            <tr>
              <td style="width:170px; color:var(--muted); vertical-align:top;">Days 18–21</td>
              <td><b>Heat recheck.</b> If she does <i>not</i> show signs of heat again around this window, that's an early
              (not certain) sign the breeding took. If she does return to heat, she'll likely need re-breeding.</td>
            </tr>
            <tr>
              <td style="color:var(--muted); vertical-align:top;">Ongoing</td>
              <td><b>Activity/rumination tracking.</b> If you use neck tags, ear tags, or pedometers, a dip in rumination
              or a spike in restlessness can flag a "silent" return to heat or a brewing health issue before it's
              visible to the eye.</td>
            </tr>
            <tr>
              <td style="color:var(--muted); vertical-align:top;">Days 28–60</td>
              <td><b>Vet confirmation.</b> An ultrasound around 28–35 days, or a manual exam nearer 60 days, gives a
              definite yes/no — everything before that is just an early hint.</td>
            </tr>
            <tr>
              <td style="color:var(--muted); vertical-align:top;">Ongoing</td>
              <td><b>Milk yield.</b> A small dip right after breeding usually just means handling stress, and yield
              doesn't spike just because conception succeeded. What matters more is a real drop in yield or appetite
              weeks later — that's often an early warning of a lost pregnancy, ketosis, or mastitis, worth investigating
              rather than assuming it's routine.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>Log an Insemination</h2>
          <p class="desc">Logs the event and automatically schedules the heat-recheck and vet-check reminders as Tasks.</p>
          <form id="aiForm">
            <div class="form-row"><label>Cow</label><select name="cow_id" required>${cows.map(c => `<option value="${c.id}">${c.tag} ${c.name ? '(' + c.name + ')' : ''}</option>`).join('')}</select></div>
            <div class="form-row"><label>A.I. Date</label><input type="date" name="date" value="${todayISO()}" required></div>
            <div class="form-row"><label>Notes</label><textarea name="description" placeholder="Sire/semen batch, technician, etc."></textarea></div>
            <button type="submit" class="primary" style="width:100%;">Log Insemination &amp; Schedule Reminders</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><h2>Recent Inseminations</h2></div>
          <table><thead><tr><th>Cow</th><th>A.I. Date</th><th>Day</th><th>Stage</th><th>Status</th><th></th></tr></thead>
          <tbody id="aiRows"></tbody></table>
        </div>
      </div>
      <div class="card hidden" id="yieldCard">
        <div class="card-head"><h2 id="yieldTitle">Milk Yield</h2><button class="small" id="closeYieldBtn">Close</button></div>
        <div id="yieldChart" class="chart-wrap"></div>
      </div>
    `;

    function stageFor(daysSince) {
      if (daysSince < 18) return 'Too early to recheck';
      if (daysSince <= 21) return '🔎 Heat recheck window';
      if (daysSince < 28) return 'Awaiting vet-check window';
      if (daysSince <= 60) return '🩺 Vet check window';
      return 'Past normal check window';
    }

    async function loadAiEvents() {
      const events = await apiGet('/health-events?type=Insemination');
      const rows = document.getElementById('aiRows');
      rows.innerHTML = events.length ? events.map(h => {
        const daysSince = Math.floor((Date.now() - new Date(h.date).getTime()) / 86400000);
        return `<tr>
          <td>${h.cow_tag}</td><td>${fmtDate(h.date)}</td><td>Day ${daysSince}</td>
          <td>${stageFor(daysSince)}</td>
          <td><span class="pill ${pillClass(h.status)}">${h.status}</span></td>
          <td><button class="small viewYieldBtn" data-cow="${h.cow_id}" data-tag="${h.cow_tag}" data-date="${h.date}">📈 Milk Yield</button></td>
        </tr>`;
      }).join('') : `<tr><td colspan="6"><div class="empty-state">No inseminations logged yet.</div></td></tr>`;

      rows.querySelectorAll('.viewYieldBtn').forEach(b => b.addEventListener('click', () => showYield(b.dataset.cow, b.dataset.tag, b.dataset.date)));
    }

    async function showYield(cowId, tag, aiDate) {
      const start = daysAgoFrom(aiDate, 10);
      const end = daysAheadFrom(aiDate, 45);
      const res = await apiGet(`/milk?cow_id=${cowId}&start=${start}&end=${end}&limit=1000`);
      const byDate = {};
      (res.data || []).forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + r.liters; });
      const dates = Object.keys(byDate).sort();
      const points = dates.map(d => ({ label: fmtDate(d).replace(/, \d+$/, ''), value: byDate[d] }));

      document.getElementById('yieldTitle').textContent = `Milk Yield — ${tag} (A.I. on ${fmtDate(aiDate)})`;
      document.getElementById('yieldCard').classList.remove('hidden');
      if (points.length) {
        drawLineChart(document.getElementById('yieldChart'), points, { valueFormatter: (v) => fmtLiters(v) });
      } else {
        document.getElementById('yieldChart').innerHTML = `<div class="empty-state">No milk records found in this window yet.</div>`;
      }
      document.getElementById('yieldCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    document.getElementById('closeYieldBtn').addEventListener('click', () => {
      document.getElementById('yieldCard').classList.add('hidden');
    });

    document.getElementById('aiForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      const cow = cows.find(c => String(c.id) === String(data.cow_id));
      await apiPost('/health-events', { ...data, type: 'Insemination', status: 'Open' });
      // Auto-schedule the two follow-up checks as Tasks, so they show up
      // on the Tasks page and dashboard without extra manual entry.
      await apiPost('/tasks', {
        title: `Heat recheck — ${cow ? cow.tag : 'cow'}`,
        description: `Watch for return-to-heat signs (A.I. was ${data.date}). No signs by now is an early indicator of pregnancy.`,
        priority: 'Medium', due_date: daysAheadFrom(data.date, 21),
      });
      await apiPost('/tasks', {
        title: `Vet pregnancy check — ${cow ? cow.tag : 'cow'}`,
        description: `Schedule an ultrasound/vet exam to confirm pregnancy (A.I. was ${data.date}).`,
        priority: 'Medium', due_date: daysAheadFrom(data.date, 45),
      });
      toast('Insemination logged — recheck & vet-check tasks scheduled');
      e.target.reset();
      loadAiEvents();
    });

    loadAiEvents();
  }

  function daysAheadFrom(dateStr, n) {
    const d = new Date(dateStr); d.setDate(d.getDate() + n);
    return localDateISO(d);
  }
  function daysAgoFrom(dateStr, n) {
    const d = new Date(dateStr); d.setDate(d.getDate() - n);
    return localDateISO(d);
  }

  const tabs = { events: renderEventsTab, ai: renderAiTab };
  document.querySelectorAll('#healthTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#healthTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); tabs[b.dataset.t]();
  }));

  document.getElementById('logEventBtn').addEventListener('click', () => {
    openModal({
      title: 'Log Health Event',
      fields: [
        { name: 'cow_id', label: 'Cow', type: 'select', required: true, options: cows.map(c => ({ value: c.id, label: `${c.tag} ${c.name ? '(' + c.name + ')' : ''}` })) },
        { name: 'type', label: 'Event Type', type: 'select', value: 'Checkup', options: HEALTH_TYPES.map(t => ({ value: t, label: t })) },
        { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'vet_name', label: 'Vet Name' },
        { name: 'cost', label: 'Cost', type: 'number', step: '0.01', value: 0 },
        { name: 'follow_up_date', label: 'Follow-up Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', value: 'Open', options: ['Open', 'In Progress', 'Resolved'].map(s => ({ value: s, label: s })) },
      ],
      submitLabel: 'Log Event',
      onSubmit: async (data, overlay) => {
        await apiPost('/health-events', { ...data, cost: Number(data.cost || 0) });
        overlay.remove(); toast('Health event logged');
        if (document.getElementById('healthRows')) renderEventsTab();
      }
    });
  });

  renderEventsTab();
}
