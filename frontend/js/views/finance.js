async function renderFinance(view) {
  const cats = await apiGet('/finance/categories');
  let type = 'All Types', category = 'All Categories';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Financial Ledger</h1><p class="subtitle">Track income, expenses, member loans, and farm profitability.</p></div>
    </div>
    <div class="tabs" id="finTabs">
      <button data-t="tx" class="active">Transactions</button>
      <button data-t="loans">💳 Loans &amp; Advances</button>
    </div>
    <div id="finBody"></div>
  `;

  async function renderTxTab() {
    document.getElementById('finBody').innerHTML = `
      <div class="page-header"><div></div><button class="primary" id="addTxBtn">+ Add Transaction</button></div>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Running Balance</div><div class="value" id="balanceVal">-</div></div>
        <div class="stat-card"><div class="label">Total Income</div><div class="value" id="incomeVal">-</div></div>
        <div class="stat-card"><div class="label">Total Expenses</div><div class="value" id="expenseVal">-</div></div>
      </div>
      <div class="toolbar">
        <select id="typeFilter"><option>All Types</option><option>Income</option><option>Expense</option></select>
        <select id="catFilter"><option>All Categories</option>${[...cats.income, ...cats.expense].map(c => `<option>${c}</option>`).join('')}</select>
      </div>
      <div class="card"><table>
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Balance</th><th></th></tr></thead>
        <tbody id="txRows"></tbody>
      </table></div>
    `;

    async function load() {
      const params = new URLSearchParams();
      if (type !== 'All Types') params.set('type', type);
      if (category !== 'All Categories') params.set('category', category);
      const res = await apiGet('/finance?' + params.toString());
      document.getElementById('balanceVal').textContent = fmtMoney(res.running_balance);
      document.getElementById('balanceVal').classList.toggle('neg', res.running_balance < 0);
      document.getElementById('incomeVal').textContent = fmtMoney(res.total_income);
      document.getElementById('expenseVal').textContent = fmtMoney(res.total_expense);

      const rows = document.getElementById('txRows');
      rows.innerHTML = res.data.length ? res.data.map(t => `
        <tr>
          <td>${fmtDate(t.date)}</td><td>${t.description || '-'}</td><td>${t.category}</td>
          <td class="amount ${t.type === 'Income' ? 'pos' : 'neg'}">${t.type === 'Income' ? '+' : '-'}${fmtMoney(Math.abs(t.amount))}</td>
          <td>${fmtMoney(t.balance)}</td>
          <td><button class="small danger delBtn" data-id="${t.id}">Delete</button></td>
        </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No transactions found.</div></td></tr>`;
      rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
        await apiDelete(`/finance/${b.dataset.id}`); toast('Transaction deleted'); load();
      }));
    }

    document.getElementById('typeFilter').addEventListener('change', (e) => { type = e.target.value; load(); });
    document.getElementById('catFilter').addEventListener('change', (e) => { category = e.target.value; load(); });

    document.getElementById('addTxBtn').addEventListener('click', () => {
      const overlay = openModal({
        title: 'Add Transaction',
        fields: [
          { name: 'type', label: 'Type', type: 'select', value: 'Income', options: [{ value: 'Income', label: 'Income' }, { value: 'Expense', label: 'Expense' }] },
          { name: 'category', label: 'Category', type: 'select', value: cats.income[0], options: cats.income.map(c => ({ value: c, label: c })) },
          { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
          { name: 'description', label: 'Description' },
          { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
        ],
        submitLabel: 'Add Transaction',
        onSubmit: async (data, ov) => {
          await apiPost('/finance', { ...data, amount: Number(data.amount) });
          ov.remove(); toast('Transaction added'); load();
        }
      });
      const typeSel = overlay.querySelector('select[name="type"]');
      const catSel = overlay.querySelector('select[name="category"]');
      typeSel.addEventListener('change', () => {
        const list = typeSel.value === 'Income' ? cats.income : cats.expense;
        catSel.innerHTML = list.map(c => `<option>${c}</option>`).join('');
      });
    });

    load();
  }

  async function renderLoansTab() {
    const farms = (await apiGet('/farms')).filter(f => !f.is_home);
    const employees = await apiGet('/employees');
    let landlords = await apiGet('/loans/landlords/list');

    document.getElementById('finBody').innerHTML = `
      <p class="desc" style="margin:10px 0;">
        <b>Short term</b> = recoverable within about a month — no guarantor needed.
        <b>Long term</b> = up to ~10 months — needs 1–2 guarantors (society members), repaid via a fixed
        installment. Both charge interest on the outstanding balance (default 2%/month). Flagged a
        <b>Defaulter</b> if a long-term loan is still unpaid 10 months after it was issued.
        Member loans auto-deduct from that farm's milk invoice each cycle; Staff and Landlord loans are
        repaid via manual "Record Payment" entries, since there's no invoice cycle to deduct from.
      </p>
      <div class="grid-2" style="grid-template-columns:minmax(0,1fr);">
        <div class="card" style="order:2; max-width:640px;">
          <h2>Issue Loan / Borrow</h2>
          <form id="loanForm">
            <div class="form-row"><label>Borrower Type</label>
              <select name="borrower_type" id="borrowerTypeSelect">
                <option value="member">Member (Partner Farm)</option>
                <option value="staff">Staff</option>
                <option value="landlord">Landlord</option>
              </select>
            </div>
            <div id="borrowerFieldWrap"></div>

            <div class="form-row"><label>Term — choose manually</label>
              <select name="kind" id="loanKindSelect">
                <option value="short">Short term (~1 month, no guarantor)</option>
                <option value="long">Long term (up to 10 months, needs guarantor)</option>
              </select>
            </div>
            <div id="loanKindHint" class="rate-preview"></div>
            <div class="form-grid">
              <div class="form-row"><label>Amount (Rs.)</label><input type="number" step="0.01" name="principal" id="loanPrincipal" required></div>
              <div class="form-row"><label>Interest Rate (%/month)</label><input type="number" step="0.01" name="interest_rate" value="2"></div>
            </div>
            <div class="form-row"><label>Date Issued</label><input type="date" name="date_issued" value="${todayISO()}" required></div>
            <div id="loanFieldsExtra"></div>
            <div class="form-row"><label>Notes</label><input name="notes"></div>
            <button type="submit" class="primary" style="width:100%;">Issue</button>
          </form>
        </div>
        <div class="card" style="order:1;">
          <div class="card-head"><h2>Active &amp; Recent</h2></div>
          <div style="overflow-x:auto;"><table><thead><tr><th>Borrower</th><th>Type</th><th>Term</th><th>Principal</th><th>Rate</th><th>Balance</th><th>Guarantor(s)</th><th>Status</th><th></th></tr></thead>
          <tbody id="loanRows"></tbody></table></div>
        </div>
      </div>
    `;

    function renderBorrowerField(type) {
      const wrap = document.getElementById('borrowerFieldWrap');
      const submitBtnReset = document.querySelector('#loanForm button[type="submit"]');
      if (submitBtnReset) submitBtnReset.disabled = false; // reset; re-checked below if type is 'member'
      if (type === 'staff') {
        wrap.innerHTML = `<div class="form-row"><label>Staff Member</label><select name="employee_id" required>
          ${employees.map(e => `<option value="${e.id}">${e.name} — ${e.role} (Salary: ${fmtMoney(e.salary || 0)})</option>`).join('')}
        </select></div>`;
      } else if (type === 'landlord') {
        wrap.innerHTML = `<div class="form-row"><label>Landlord</label>
          <select name="landlord_id" id="landlordSelect" required>
            ${landlords.map(l => `<option value="${l.id}">${l.name} (Rent: ${fmtMoney(l.rent_amount || 0)}/mo)</option>`).join('')}
          </select>
          <button type="button" id="addLandlordBtn" class="small" style="margin-top:6px;">+ Add New Landlord</button>
        </div>`;
        document.getElementById('addLandlordBtn').addEventListener('click', () => {
          openModal({
            title: 'Add Landlord',
            fields: [
              { name: 'name', label: 'Name', required: true },
              { name: 'contact_phone', label: 'Phone' },
              { name: 'rent_amount', label: 'Monthly Rent (Rs.)', type: 'number', step: '0.01' },
              { name: 'notes', label: 'Notes' },
            ],
            submitLabel: 'Add Landlord',
            onSubmit: async (data, ov) => {
              await apiPost('/loans/landlords/list', { ...data, rent_amount: Number(data.rent_amount || 0) });
              landlords = await apiGet('/loans/landlords/list');
              ov.remove(); toast('Landlord added'); renderBorrowerField('landlord');
            }
          });
        });
      } else {
        wrap.innerHTML = `<div class="form-row"><label>Member (Farm)</label><select name="farm_id" id="loanFarmSelect" required>
          ${farms.map(f => `<option value="${f.id}" data-approved="${f.membership_status === 'Approved' ? '1' : '0'}">${f.name} — ${f.location}${f.membership_status === 'Approved' ? '' : ' (Pending approval)'} (Share: ${fmtMoney(f.share_deposit || 0)})</option>`).join('')}
        </select></div>
        <div id="memberApprovalWarning"></div>`;
        document.getElementById('loanFarmSelect').addEventListener('change', () => { updateHint(); updateApprovalWarning(); });
        updateApprovalWarning();
      }
    }

    function updateApprovalWarning() {
      const warn = document.getElementById('memberApprovalWarning');
      const farmSelect = document.getElementById('loanFarmSelect');
      const submitBtn = document.querySelector('#loanForm button[type="submit"]');
      if (!warn || !farmSelect) return;
      const approved = farmSelect.selectedOptions[0] && farmSelect.selectedOptions[0].dataset.approved === '1';
      if (!approved) {
        warn.innerHTML = `<p class="desc" style="color:#c0392b;">This member is not yet approved. Approve them first in Milk Network -> Partner Farm Register before a Loan or Borrow can be issued.</p>`;
        if (submitBtn) submitBtn.disabled = true;
      } else {
        warn.innerHTML = '';
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function renderKindExtra(kind) {
      const extra = document.getElementById('loanFieldsExtra');
      if (kind === 'long') {
        extra.innerHTML = `
          <div class="form-grid">
            <div class="form-row"><label>Guarantor 1 (required, society member)</label><select name="guarantor1_farm_id" required>${farms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
            <div class="form-row"><label>Guarantor 2 (optional)</label><select name="guarantor2_farm_id"><option value="">— None —</option>${farms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
          </div>
          <div class="form-row"><label>Monthly Installment (Rs.)</label><input type="number" step="0.01" name="installment_amount" required></div>`;
      } else {
        extra.innerHTML = '';
      }
    }

    // This is a HINT only — it never changes the Term dropdown itself.
    // Term is always the staff member's own manual choice.
    async function updateHint() {
      const type = document.getElementById('borrowerTypeSelect').value;
      const principal = Number(document.getElementById('loanPrincipal').value || 0);
      const hint = document.getElementById('loanKindHint');
      if (type !== 'member') { hint.textContent = ''; return; }
      const farmSelect = document.getElementById('loanFarmSelect');
      if (!farmSelect || !principal) { hint.textContent = 'Enter an amount to see a reference point based on this member\'s recent milk earnings.'; return; }
      try {
        const collections = await apiGet(`/farms/${farmSelect.value}/collections?start=${daysAgoISO(30)}&end=${todayISO()}`);
        const monthlyValue = collections.reduce((s, c) => s + c.liters * c.rate_per_liter, 0);
        hint.innerHTML = `This member's last 30 days of milk earnings: <b>${fmtMoney(monthlyValue)}</b> — ` +
          (principal <= monthlyValue
            ? `this amount could likely be recovered in one cycle.`
            : `this exceeds one month's earnings, so Long term may suit better.`) +
          ` (You choose the Term above — this is just a reference.)`;
      } catch (err) { hint.textContent = ''; }
    }

    document.getElementById('borrowerTypeSelect').addEventListener('change', (e) => { renderBorrowerField(e.target.value); updateHint(); });
    document.getElementById('loanPrincipal').addEventListener('input', updateHint);
    document.getElementById('loanKindSelect').addEventListener('change', (e) => renderKindExtra(e.target.value));
    renderBorrowerField('member');
    renderKindExtra('short');

    const canDeleteLoans = ['admin', 'manager'].includes((getCurrentUser() || {}).role);
    const rateText = (l) => `${Number(l.interest_rate)}%/mo`;

    // Full loan history: terms, interest figures, and every repayment.
    async function showLoanHistory(id) {
      const loan = await apiGet(`/loans/${id}`);
      const rows = loan.repayments.length
        ? loan.repayments.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${fmtMoney(r.interest_accrued)}</td><td>${fmtMoney(r.amount_paid)}</td><td>${r.source === 'invoice' ? 'Auto (invoice)' : 'Manual'}</td><td>${escHtml(r.notes || '')}</td></tr>`).join('')
        : `<tr><td colspan="5">No repayments recorded yet.</td></tr>`;
      const pendingNote = loan.status === 'Active' && loan.pending_interest > 0
        ? `<tr><td colspan="5" style="color:#b9770e;">+ ${fmtMoney(loan.pending_interest)} interest has built up since ${fmtDate(loan.last_interest_date || loan.date_issued)} and will be charged with the next payment.</td></tr>` : '';
      openModal({
        title: `${loan.borrower_name} — ${loan.kind === 'long' ? 'Long term Loan' : 'Short term Borrow'} History`,
        fields: [],
        submitLabel: 'Close',
        extraHtml: `
          <div class="stat-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:12px;">
            <div class="stat-card"><div class="label">Principal</div><div class="value" style="font-size:16px;">${fmtMoney(loan.principal)}</div></div>
            <div class="stat-card"><div class="label">Interest Rate</div><div class="value" style="font-size:16px;">${rateText(loan)}</div></div>
            <div class="stat-card"><div class="label">Issued</div><div class="value" style="font-size:16px;">${fmtDate(loan.date_issued)}</div></div>
            <div class="stat-card"><div class="label">Interest Charged</div><div class="value" style="font-size:16px;">${fmtMoney(loan.interest_booked)}</div></div>
            <div class="stat-card"><div class="label">Interest Pending</div><div class="value" style="font-size:16px;">${fmtMoney(loan.pending_interest)}</div></div>
            <div class="stat-card"><div class="label">Total Paid</div><div class="value" style="font-size:16px;">${fmtMoney(loan.total_paid)}</div></div>
          </div>
          <p style="margin:0 0 10px; font-size:13px;">Balance: <b>${fmtMoney(loan.balance)}</b> · To clear today (balance + pending interest): <b>${fmtMoney(loan.amount_due)}</b></p>
          <table><thead><tr><th>Date</th><th>Interest</th><th>Paid</th><th>Source</th><th>Notes</th></tr></thead><tbody>${rows}${pendingNote}</tbody></table>`,
        onSubmit: async (data, ov) => ov.remove(),
      });
    }

    function editLoan(loan) {
      const locked = loan.repayment_count > 0;
      const overlay = openModal({
        title: `Edit Loan — ${loan.borrower_name}`,
        fields: [
          ...(locked ? [] : [{ name: 'principal', label: 'Amount (Rs.)', type: 'number', step: '0.01', value: loan.principal, required: true }]),
          { name: 'kind', label: 'Term', type: 'select', value: loan.kind, options: [{ value: 'short', label: 'Short term' }, { value: 'long', label: 'Long term' }] },
          { name: 'interest_rate', label: 'Interest Rate (%/month)', type: 'number', step: '0.01', value: loan.interest_rate, required: true },
          { name: 'date_issued', label: 'Date Issued', type: 'date', value: loan.date_issued, required: true },
          { name: 'installment_amount', label: 'Monthly Installment (Rs.) — long term only', type: 'number', step: '0.01', value: loan.installment_amount ?? '' },
          { name: 'guarantor1_farm_id', label: 'Guarantor 1 — long term only', type: 'select', value: loan.guarantor1_farm_id ?? '', options: [{ value: '', label: '— None —' }, ...farms.map(f => ({ value: f.id, label: f.name }))] },
          { name: 'guarantor2_farm_id', label: 'Guarantor 2 (optional)', type: 'select', value: loan.guarantor2_farm_id ?? '', options: [{ value: '', label: '— None —' }, ...farms.map(f => ({ value: f.id, label: f.name }))] },
          { name: 'notes', label: 'Notes', value: escHtml(loan.notes || '') },
        ],
        submitLabel: 'Save Changes',
        extraHtml: locked ? `<p class="desc" style="margin:0;">The amount can't be changed because repayments already exist. To correct it, delete this loan and issue it again.</p>` : '',
        onSubmit: async (data, ov) => {
          const body = { ...data };
          if (body.principal !== undefined) body.principal = Number(body.principal);
          await apiPut(`/loans/${loan.id}`, body);
          ov.remove(); toast('Loan updated'); loadLoans();
        },
      });
      return overlay;
    }

    async function deleteLoan(loan) {
      const extra = loan.repayment_count > 0 ? ` Its ${loan.repayment_count} repayment record(s) will be deleted too.` : '';
      if (!confirm(`Delete the loan for ${loan.borrower_name} (${fmtMoney(loan.principal)})?${extra} This cannot be undone.`)) return;
      try { await apiDelete(`/loans/${loan.id}`); toast('Loan deleted'); loadLoans(); }
      catch (err) { toast(err.message, true); }
    }

    async function loadLoans() {
      const loans = await apiGet('/loans');
      document.getElementById('loanRows').innerHTML = loans.length ? loans.map(l => {
        const guarantors = [l.guarantor1_name, l.guarantor2_name].filter(Boolean).map(escHtml).join(', ') || '-';
        const typeLabel = { member: 'Member', staff: 'Staff', landlord: 'Landlord' }[l.borrower_type] || l.borrower_type;
        const active = l.status === 'Active';
        return `<tr>
          <td>${escHtml(l.borrower_name)}</td><td>${typeLabel}</td><td>${l.kind === 'long' ? 'Long term' : 'Short term'}</td>
          <td>${fmtMoney(l.principal)}</td>
          <td>${rateText(l)}</td>
          <td><b>${fmtMoney(l.balance)}</b>${active && l.pending_interest > 0 ? `<div style="font-size:11px; color:#b9770e;">+ ${fmtMoney(l.pending_interest)} interest</div><div style="font-size:11px; color:var(--muted);">Due: ${fmtMoney(l.amount_due)}</div>` : ''}</td>
          <td>${guarantors}</td>
          <td><span class="pill ${pillClass(l.status)}">${l.status}</span>${l.is_defaulter ? ' <span class="pill red">Defaulter</span>' : ''}</td>
          <td><div style="display:flex; flex-wrap:wrap; gap:4px; min-width:150px; max-width:240px;">
            <button class="small viewLoanBtn" data-id="${l.id}">History</button>
            <button class="small statementBtn" data-id="${l.id}" data-name="${escHtml(l.borrower_name)}">Statement</button>
            ${active ? `<button class="small payLoanBtn" data-id="${l.id}">Record Payment</button>` : ''}
            <button class="small editLoanBtn" data-id="${l.id}">Edit</button>
            ${canDeleteLoans ? `<button class="small danger delLoanBtn" data-id="${l.id}">Delete</button>` : ''}
          </div></td>
        </tr>`;
      }).join('') : `<tr><td colspan="9"><div class="empty-state">No loans or borrows issued yet.</div></td></tr>`;

      const byId = (id) => loans.find(l => l.id === Number(id));
      document.querySelectorAll('.statementBtn').forEach(b => b.addEventListener('click', () => {
        downloadWithAuth(`${API_BASE}/reports/loans/${b.dataset.id}/statement/pdf`, `loan-statement-${b.dataset.id}-${b.dataset.name.replace(/\s+/g, '-')}.pdf`, 'Statement downloaded');
      }));
      document.querySelectorAll('.viewLoanBtn').forEach(b => b.addEventListener('click', () => showLoanHistory(b.dataset.id).catch(err => toast(err.message, true))));
      document.querySelectorAll('.editLoanBtn').forEach(b => b.addEventListener('click', () => editLoan(byId(b.dataset.id))));
      document.querySelectorAll('.delLoanBtn').forEach(b => b.addEventListener('click', () => deleteLoan(byId(b.dataset.id))));
      document.querySelectorAll('.payLoanBtn').forEach(b => b.addEventListener('click', () => {
        const loan = byId(b.dataset.id);
        openModal({
          title: 'Record Manual Repayment',
          fields: [
            { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
            { name: 'amount', label: `Amount (balance ${fmtMoney(loan.balance)} + interest ${fmtMoney(loan.pending_interest)} = ${fmtMoney(loan.amount_due)} to clear today)`, type: 'number', step: '0.01', required: true },
            { name: 'notes', label: 'Notes' },
          ],
          submitLabel: 'Record Payment',
          extraHtml: `<p class="desc" style="margin:0;">Interest at ${rateText(loan)} is charged on the balance up to the payment date, then the payment is applied to balance + interest.</p>`,
          onSubmit: async (data, ov) => {
            const res = await apiPost(`/loans/${loan.id}/repayments`, { ...data, amount: Number(data.amount) });
            const repayment = res.repayment; // real figures from the server, including interest charged
            ov.remove(); toast('Repayment recorded');
            const fullLoan = await apiGet(`/loans/${loan.id}`);
            openModal({
              title: 'Repayment Recorded',
              fields: [],
              submitLabel: 'Close',
              extraHtml: `<p style="margin-bottom:14px;">${fmtMoney(repayment.amount_paid)} recorded for ${escHtml(fullLoan.borrower_name)}${repayment.interest_accrued > 0 ? ` (interest charged: ${fmtMoney(repayment.interest_accrued)})` : ''}. Remaining balance: ${fmtMoney(fullLoan.balance)}.</p>
                <div style="display:flex; gap:8px;">
                  <button type="button" id="printLoanReceiptBtn" class="small">🖨 Print Receipt</button>
                  <button type="button" id="waLoanReceiptBtn" class="small">📱 Send on WhatsApp</button>
                </div>`,
              onSubmit: async (d, o) => o.remove(),
            });
            document.getElementById('printLoanReceiptBtn').addEventListener('click', () => openLoanReceipt(fullLoan, repayment));
            document.getElementById('waLoanReceiptBtn').addEventListener('click', () => sendLoanReceiptOnWhatsApp(fullLoan, repayment, fullLoan.borrower_phone));
            loadLoans();
          }
        });
      }));
    }

    document.getElementById('loanForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await apiPost('/loans', { ...data, principal: Number(data.principal), interest_rate: Number(data.interest_rate || 0), installment_amount: data.installment_amount ? Number(data.installment_amount) : undefined });
        toast('Issued'); e.target.reset();
        document.getElementById('borrowerTypeSelect').value = 'member';
        renderBorrowerField('member'); renderKindExtra('short'); loadLoans();
      } catch (err) { toast(err.message, true); }
    });

    loadLoans();
  }

  const tabs = { tx: renderTxTab, loans: renderLoansTab };
  document.querySelectorAll('#finTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#finTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); tabs[b.dataset.t]();
  }));

  renderTxTab();
}
