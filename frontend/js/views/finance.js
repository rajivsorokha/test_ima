async function renderFinance(view) {
  const cats = await apiGet('/finance/categories');
  let type = 'All Types', category = 'All Categories';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Financial Ledger</h1><p class="subtitle">Track income, expenses, and farm profitability.</p></div>
      <button class="primary" id="addTxBtn">+ Add Transaction</button>
    </div>
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
    let txType = 'Income';
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
