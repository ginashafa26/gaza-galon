document.addEventListener('DOMContentLoaded', async () => {
  const SETORAN_PRICE = { galon: 3000, leeMineral: 2000 };
  const SALES_PRICE = { galon: 4000, leeMineral: 3000 };
  const REPORT_PASSWORD = '1234';
  const { STORES } = GazaDB;
  const byId = (id) => document.getElementById(id);
  const pad = (value) => String(value).padStart(2, '0');
  const getLocalDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const getLocalTime = (date = new Date()) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const getLocalDateTime = (date = new Date()) => `${getLocalDate(date)}T${getLocalTime(date)}`;
  const today = () => getLocalDate();
  const rupiah = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
  const subtotal = (galon, leeMineral, price) => galon * price.galon + leeMineral * price.leeMineral;
  const timeParts = () => {
    const now = new Date();
    return { tanggal: getLocalDate(now), waktu: getLocalTime(now), createdAt: getLocalDateTime(now) };
  };
  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;'
    }[char]));

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  // State
  let currentEmployeeForSetoran = 'Oleh';
  let selectedServerForSale = null; // Tidak ada default di awal
  let deleteCallback = null;
  let editSaveCallback = null;

  /* ==========================================================================
     KOMPONEN INPUT JUMLAH (STEPPER)
     Universal stepper helper: min 0, max 99, 1 fungsi konsisten
     ========================================================================== */
  function getStepperVal(targetId) {
    const el = byId(targetId);
    return el ? Math.max(0, Number.parseInt(el.textContent, 10) || 0) : 0;
  }

  function setStepperVal(targetId, newVal) {
    const el = byId(targetId);
    if (!el) return;
    const clamped = Math.max(0, Math.min(99, Number.parseInt(newVal, 10) || 0));
    el.textContent = String(clamped);

    // Update form validation & subtotal real-time
    if (targetId.startsWith('setoran-')) {
      updateSetoranFormState();
    } else if (targetId.startsWith('jual-')) {
      updateJualFormState();
    } else if (targetId.startsWith('order-')) {
      updateOrderFormState();
    }
  }

  function changeStepperVal(targetId, delta) {
    setStepperVal(targetId, getStepperVal(targetId) + delta);
  }

  function resetStepper(...targetIds) {
    targetIds.forEach((id) => setStepperVal(id, 0));
  }

  // Delegasi event listener untuk semua tombol stepper (+ dan -)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.stepper-btn');
    if (!btn) return;
    const targetId = btn.dataset.stepperTarget;
    if (!targetId) return;

    if (btn.classList.contains('btn-plus')) {
      changeStepperVal(targetId, 1);
    } else if (btn.classList.contains('btn-minus')) {
      changeStepperVal(targetId, -1);
    }
  });

  /* ==========================================================================
     ALUR 1: BAWA GALON (OLEH / DADANG)
     ========================================================================== */
  function openSetoranFlow(employeeName) {
    currentEmployeeForSetoran = employeeName;
    // Nama berwarna, kata SETORAN tetap navy
    const cls = employeeName === 'Oleh' ? 'nama-oleh' : 'nama-dadang';
    byId('setoran-screen-name').innerHTML = `SETORAN <span class="${cls}">${employeeName.toUpperCase()}</span>`;
    resetStepper('setoran-galon', 'setoran-lee');
    showView('setoran-view');
  }

  function updateSetoranFormState() {
    const g = getStepperVal('setoran-galon');
    const l = getStepperVal('setoran-lee');
    const tot = subtotal(g, l, SETORAN_PRICE);
    const nominalEl = byId('setoran-nominal-display');
    if (nominalEl) nominalEl.textContent = rupiah(tot);

    const btnSave = byId('btn-save-setoran');
    const hintEl = byId('setoran-hint');
    if (g === 0 && l === 0) {
      if (btnSave) btnSave.disabled = true;
      if (hintEl) {
        hintEl.textContent = 'Isi jumlah dulu';
        hintEl.hidden = false;
      }
    } else {
      if (btnSave) btnSave.disabled = false;
      if (hintEl) hintEl.hidden = true;
    }
  }

  async function executeSaveSetoran() {
    const galon = getStepperVal('setoran-galon');
    const leeMineral = getStepperVal('setoran-lee');
    if (galon === 0 && leeMineral === 0) return;

    const record = {
      ...timeParts(),
      employee: currentEmployeeForSetoran,
      type: 'BAWA_GALON',
      customer: '',
      location: '',
      galon,
      leeMineral,
      status: 'SELESAI',
      subtotal: subtotal(galon, leeMineral, SETORAN_PRICE)
    };

    try {
      const savedId = await GazaDB.add(STORES.employeeTransactions, record);
      resetStepper('setoran-galon', 'setoran-lee');
      await refreshAll();
      showSuccessFeedback({
        title: 'Tersimpan',
        detail: `Setoran ${currentEmployeeForSetoran}: ${galon} Galon${leeMineral > 0 ? `, ${leeMineral} Lee Mineral` : ''}`,
        storeName: STORES.employeeTransactions,
        id: savedId
      });
    } catch (err) {
      console.error(err);
      alert('Belum bisa disimpan, coba lagi.');
    }
  }

  /* ==========================================================================
     ALUR 2: JUAL LANGSUNG
     ========================================================================== */
  function openJualFlow() {
    selectedServerForSale = null;
    document.querySelectorAll('.server-choice-btn').forEach((b) => b.classList.remove('selected'));
    resetStepper('jual-galon', 'jual-lee');
    showView('jual-view');
  }

  function updateJualFormState() {
    const g = getStepperVal('jual-galon');
    const l = getStepperVal('jual-lee');
    const tot = subtotal(g, l, SALES_PRICE);
    const nominalEl = byId('jual-nominal-display');
    if (nominalEl) nominalEl.textContent = rupiah(tot);

    const btnSave = byId('btn-save-jual');
    const hintEl = byId('jual-hint');

    if (!selectedServerForSale) {
      if (btnSave) btnSave.disabled = true;
      if (hintEl) {
        hintEl.textContent = 'Pilih siapa yang melayani';
        hintEl.hidden = false;
      }
    } else if (g === 0 && l === 0) {
      if (btnSave) btnSave.disabled = true;
      if (hintEl) {
        hintEl.textContent = 'Isi jumlah dulu';
        hintEl.hidden = false;
      }
    } else {
      if (btnSave) btnSave.disabled = false;
      if (hintEl) hintEl.hidden = true;
    }
  }

  async function executeSaveSale() {
    const galon = getStepperVal('jual-galon');
    const leeMineral = getStepperVal('jual-lee');
    if (!selectedServerForSale || (galon === 0 && leeMineral === 0)) return;

    const record = {
      ...timeParts(),
      servedBy: selectedServerForSale,
      galon,
      leeMineral,
      total: subtotal(galon, leeMineral, SALES_PRICE)
    };

    try {
      const savedId = await GazaDB.add(STORES.directSales, record);
      resetStepper('jual-galon', 'jual-lee');
      selectedServerForSale = null;
      document.querySelectorAll('.server-choice-btn').forEach((b) => b.classList.remove('selected'));
      await refreshAll();
      showSuccessFeedback({
        title: 'Tersimpan',
        detail: `Penjualan: ${galon} Galon${leeMineral > 0 ? `, ${leeMineral} Lee Mineral` : ''}`,
        storeName: STORES.directSales,
        id: savedId
      });
    } catch (err) {
      console.error(err);
      alert('Belum bisa disimpan, coba lagi.');
    }
  }

  /* ==========================================================================
     ALUR 3: PESANAN (BARU & DAFTAR BELUM SELESAI)
     ========================================================================== */
  function openNewOrderFlow() {
    byId('order-customer-input').value = '';
    byId('order-location-input').value = '';
    resetStepper('order-galon', 'order-lee');
    showView('pesanan-new-view');
  }

  function updateOrderFormState() {
    const customer = byId('order-customer-input')?.value.trim() || '';
    const g = getStepperVal('order-galon');
    const l = getStepperVal('order-lee');
    const btnSave = byId('btn-save-order');
    const hintEl = byId('order-hint');

    if (!customer) {
      if (btnSave) btnSave.disabled = true;
      if (hintEl) {
        hintEl.textContent = 'Isi nama pelanggan';
        hintEl.hidden = false;
      }
    } else if (g === 0 && l === 0) {
      if (btnSave) btnSave.disabled = true;
      if (hintEl) {
        hintEl.textContent = 'Isi jumlah galon';
        hintEl.hidden = false;
      }
    } else {
      if (btnSave) btnSave.disabled = false;
      if (hintEl) hintEl.hidden = true;
    }
  }

  async function executeSaveOrder() {
    const customer = byId('order-customer-input').value.trim();
    const location = byId('order-location-input').value.trim();
    const galon = getStepperVal('order-galon');
    const leeMineral = getStepperVal('order-lee');
    if (!customer || (galon === 0 && leeMineral === 0)) return;

    const record = {
      ...timeParts(),
      customer,
      location,
      galon,
      leeMineral,
      employee: '',
      status: 'BELUM DIAMBIL',
      employeeDeposit: subtotal(galon, leeMineral, SETORAN_PRICE),
      completedAt: null,
      note: `${customer}, ${location}, ${galon} galon, ${leeMineral} Lee Mineral`
    };

    try {
      const savedId = await GazaDB.add(STORES.specialOrders, record);
      byId('order-customer-input').value = '';
      byId('order-location-input').value = '';
      resetStepper('order-galon', 'order-lee');
      await refreshAll();
      showSuccessFeedback({
        title: 'Tersimpan',
        detail: `Pesanan ${customer} tersimpan`,
        storeName: STORES.specialOrders,
        id: savedId,
        isOrder: true
      });
    } catch (err) {
      console.error(err);
      alert('Belum bisa disimpan, coba lagi.');
    }
  }

  // Sinkronisasi Order Khusus -> Setoran (TETAP SAMA DENGAN LOGIC ASLI)
  async function syncOrderEmployeeTransaction(order) {
    const transactions = (await GazaDB.getAll(STORES.employeeTransactions)).filter(
      (transaction) => transaction.specialOrderId === order.id
    );
    const linkedRecord = {
      ...(transactions[0] || {}),
      ...timeParts(),
      tanggal: order.tanggal,
      waktu: order.waktu,
      employee: order.employee,
      type: 'ORDER_KHUSUS',
      customer: order.customer,
      location: order.location,
      galon: order.galon,
      leeMineral: order.leeMineral,
      status: order.status,
      subtotal: subtotal(order.galon, order.leeMineral, SETORAN_PRICE),
      specialOrderId: order.id
    };

    if (order.status === 'BELUM DIAMBIL' || !order.employee) {
      await Promise.all(
        transactions.map((transaction) => GazaDB.delete(STORES.employeeTransactions, transaction.id))
      );
      return;
    }

    if (transactions[0]) {
      await GazaDB.update(STORES.employeeTransactions, linkedRecord);
      await Promise.all(
        transactions.slice(1).map((transaction) => GazaDB.delete(STORES.employeeTransactions, transaction.id))
      );
    } else {
      await GazaDB.add(STORES.employeeTransactions, linkedRecord);
    }
  }

  async function updateOrder(order, employee) {
    if (!order || order.status !== 'BELUM DIAMBIL') return;
    const updated = {
      ...order,
      employee,
      status: `DIBAWA ${employee.toUpperCase()}`,
      employeeDeposit: subtotal(order.galon, order.leeMineral, SETORAN_PRICE)
    };
    await GazaDB.update(STORES.specialOrders, updated);
    await syncOrderEmployeeTransaction(updated);
    await refreshAll();
  }

  async function markOrderComplete(order) {
    if (order && order.status !== 'SELESAI') {
      const updated = {
        ...order,
        status: 'SELESAI',
        completedAt: getLocalDateTime()
      };
      await GazaDB.update(STORES.specialOrders, updated);
      await syncOrderEmployeeTransaction(updated);
      await refreshAll();
    }
  }

  /* Render Daftar Pesanan Belum Selesai */
  function getStatusDisplay(status) {
    if (status === 'BELUM DIAMBIL') return { label: 'Belum diambil', cls: 'badge-pending' };
    if (status === 'DIBAWA OLEH') return { label: 'Sedang dibawa <span class="nama-oleh">Oleh</span>', cls: 'badge-moving' };
    if (status === 'DIBAWA DADANG') return { label: 'Sedang dibawa <span class="nama-dadang">Dadang</span>', cls: 'badge-moving' };
    if (status === 'SELESAI') return { label: 'Selesai', cls: 'badge-done' };
    return { label: status, cls: 'badge-moving' };
  }

  async function renderPendingOrders() {
    const orders = (await GazaDB.getAll(STORES.specialOrders))
      .filter((order) => order.status !== 'SELESAI')
      .reverse();

    // Home Alert Bar: HANYA muncul jika ada pesanan belum selesai
    const alertBar = byId('pending-alert-bar');
    const alertText = byId('pending-alert-text');
    if (orders.length > 0) {
      alertBar.hidden = false;
      alertText.textContent = `Ada ${orders.length} pesanan belum selesai`;
    } else {
      alertBar.hidden = true;
    }

    // List View
    const container = byId('pending-orders-container');
    if (!container) return;

    if (orders.length === 0) {
      container.innerHTML = '<div class="card"><p class="form-hint" style="font-size:18px;margin:20px 0;">Tidak ada pesanan aktif saat ini.</p></div>';
      return;
    }

    container.innerHTML = orders
      .map((order) => {
        const statusInfo = getStatusDisplay(order.status);
        const itemText = `${order.galon} Galon${order.leeMineral > 0 ? `, ${order.leeMineral} Lee Mineral` : ''}`;

        return `
        <div class="order-detail-card" data-order-id="${order.id}">
          <div class="order-detail-head">
            <div>
              <h3 class="order-customer-name">${escapeHtml(order.customer)}</h3>
              <p class="order-location-text">📍 ${escapeHtml(order.location || 'Lokasi belum diisi')}</p>
            </div>
          </div>
          <div>
            <span class="order-items-badge">📦 ${itemText}</span>
          </div>
          <div>
            <span class="order-status-badge ${statusInfo.cls}">${statusInfo.label}</span>
          </div>
          <div class="order-card-actions">
            ${
              order.status === 'BELUM DIAMBIL'
                ? `<div class="order-pickup-row">
                    <button type="button" class="pickup-btn" data-take-order="${order.id}" data-employee="Oleh">DIAMBIL <span class="nama-oleh">OLEH</span></button>
                    <button type="button" class="pickup-btn" data-take-order="${order.id}" data-employee="Dadang">DIAMBIL <span class="nama-dadang">DADANG</span></button>
                  </div>`
                : `<button type="button" class="finish-order-btn" data-order-complete="${order.id}">SELESAI</button>`
            }
            <div class="order-secondary-actions">
              <button type="button" class="btn-order-edit" data-edit-store="${STORES.specialOrders}" data-edit-id="${order.id}">Ubah</button>
              <button type="button" class="btn-order-delete" data-delete-store="${STORES.specialOrders}" data-delete-id="${order.id}">Hapus</button>
            </div>
          </div>
        </div>`;
      })
      .join('');
  }

  /* ==========================================================================
     FEEDBACK SETELAH SIMPAN (Layar hijau sederhana, tanpa batalkan/countdown)
     ========================================================================== */
  function showSuccessFeedback({ title, detail }) {
    const overlay = byId('success-overlay');
    byId('success-title').textContent = title;
    byId('success-detail').textContent = detail;
    overlay.hidden = false;
  }

  byId('btn-done-save').addEventListener('click', () => {
    byId('success-overlay').hidden = true;
    showView('home-view');
  });

  // Tap di mana saja di overlay untuk tutup (selain tap di dalam card)
  byId('success-overlay').addEventListener('click', (e) => {
    if (!e.target.closest('.success-content')) {
      byId('success-overlay').hidden = true;
      showView('home-view');
    }
  });

  /* ==========================================================================
     KONFIRMASI HAPUS MODAL (Ganti confirm())
     Default fokus pada tombol TIDAK
     ========================================================================== */
  function showDeleteConfirmModal(message, onConfirm) {
    const modal = byId('delete-modal');
    byId('delete-modal-message').textContent = message;
    deleteCallback = onConfirm;
    modal.hidden = false;
    byId('btn-delete-cancel').focus();
  }

  byId('btn-delete-cancel').addEventListener('click', () => {
    byId('delete-modal').hidden = true;
    deleteCallback = null;
  });

  byId('btn-delete-confirm').addEventListener('click', async () => {
    byId('delete-modal').hidden = true;
    if (typeof deleteCallback === 'function') {
      await deleteCallback();
      deleteCallback = null;
    }
  });

  /* ==========================================================================
     FORM MODAL EDIT (Pengganti prompt() browser)
     ========================================================================== */
  async function openEditModal(storeName, id) {
    const row = await GazaDB.get(storeName, id);
    if (!row) return;

    const modal = byId('edit-modal');
    const body = byId('edit-modal-body');
    const title = byId('edit-modal-title');

    if (storeName === STORES.specialOrders) {
      title.textContent = 'Ubah Pesanan';
      body.innerHTML = `
        <div class="form-large-group">
          <label class="large-input-label">Nama Pelanggan</label>
          <input id="edit-customer" class="large-text-input" type="text" value="${escapeHtml(row.customer || '')}">
        </div>
        <div class="form-large-group">
          <label class="large-input-label">Lokasi Antar</label>
          <input id="edit-location" class="large-text-input" type="text" value="${escapeHtml(row.location || '')}">
        </div>
        <div class="stepper-block">
          <label class="stepper-title">GALON</label>
          <div class="stepper-controls">
            <button type="button" class="stepper-btn btn-minus" data-stepper-target="edit-galon">-</button>
            <div class="stepper-value-display" id="edit-galon">${row.galon || 0}</div>
            <button type="button" class="stepper-btn btn-plus" data-stepper-target="edit-galon">+</button>
          </div>
        </div>
        <div class="stepper-block">
          <label class="stepper-title">LEE MINERAL</label>
          <div class="stepper-controls">
            <button type="button" class="stepper-btn btn-minus" data-stepper-target="edit-lee">-</button>
            <div class="stepper-value-display" id="edit-lee">${row.leeMineral || 0}</div>
            <button type="button" class="stepper-btn btn-plus" data-stepper-target="edit-lee">+</button>
          </div>
        </div>
        <div class="form-large-group" style="margin-top:16px;">
          <label class="large-input-label">Siapa yang membawa?</label>
          <select id="edit-employee" class="large-text-input">
            <option value="" ${!row.employee ? 'selected' : ''}>Belum diambil</option>
            <option value="Oleh" ${row.employee === 'Oleh' ? 'selected' : ''}>Oleh</option>
            <option value="Dadang" ${row.employee === 'Dadang' ? 'selected' : ''}>Dadang</option>
          </select>
        </div>
        <div class="form-large-group">
          <label class="large-input-label">Status</label>
          <select id="edit-status" class="large-text-input">
            <option value="BELUM DIAMBIL" ${row.status === 'BELUM DIAMBIL' ? 'selected' : ''}>Belum diambil</option>
            <option value="DIBAWA" ${row.status.startsWith('DIBAWA') ? 'selected' : ''}>Sedang dibawa</option>
            <option value="SELESAI" ${row.status === 'SELESAI' ? 'selected' : ''}>Selesai</option>
          </select>
        </div>
      `;

      editSaveCallback = async () => {
        const customer = byId('edit-customer').value.trim();
        const location = byId('edit-location').value.trim();
        const galon = getStepperVal('edit-galon');
        const leeMineral = getStepperVal('edit-lee');
        const employee = byId('edit-employee').value;
        const requestedStatus = byId('edit-status').value;

        if (!customer || (galon === 0 && leeMineral === 0)) {
          alert('Isi nama pelanggan dan jumlah galon.');
          return false;
        }

        let normalizedStatus = 'BELUM DIAMBIL';
        let normalizedEmployee = employee;
        if (requestedStatus === 'SELESAI') {
          normalizedStatus = 'SELESAI';
        } else if (employee || requestedStatus === 'DIBAWA') {
          normalizedEmployee = employee || 'Oleh';
          normalizedStatus = `DIBAWA ${normalizedEmployee.toUpperCase()}`;
        }

        const updated = {
          ...row,
          customer,
          location,
          galon,
          leeMineral,
          employee: normalizedStatus === 'BELUM DIAMBIL' ? '' : normalizedEmployee,
          status: normalizedStatus,
          employeeDeposit: subtotal(galon, leeMineral, SETORAN_PRICE),
          completedAt: normalizedStatus === 'SELESAI' ? row.completedAt || getLocalDateTime() : null,
          note: `${customer}, ${location}, ${galon} galon, ${leeMineral} Lee Mineral`
        };

        await GazaDB.update(STORES.specialOrders, updated);
        await syncOrderEmployeeTransaction(updated);
        await refreshAll();
        return true;
      };
    } else {
      // Edit Setoran / Jual Langsung
      const isSetoran = storeName === STORES.employeeTransactions;
      title.textContent = isSetoran ? `Ubah Setoran ${row.employee}` : `Ubah Penjualan (${row.servedBy})`;
      body.innerHTML = `
        <div class="stepper-block">
          <label class="stepper-title">GALON</label>
          <div class="stepper-controls">
            <button type="button" class="stepper-btn btn-minus" data-stepper-target="edit-galon">-</button>
            <div class="stepper-value-display" id="edit-galon">${row.galon || 0}</div>
            <button type="button" class="stepper-btn btn-plus" data-stepper-target="edit-galon">+</button>
          </div>
        </div>
        <div class="stepper-block">
          <label class="stepper-title">LEE MINERAL</label>
          <div class="stepper-controls">
            <button type="button" class="stepper-btn btn-minus" data-stepper-target="edit-lee">-</button>
            <div class="stepper-value-display" id="edit-lee">${row.leeMineral || 0}</div>
            <button type="button" class="stepper-btn btn-plus" data-stepper-target="edit-lee">+</button>
          </div>
        </div>
      `;

      editSaveCallback = async () => {
        const galon = getStepperVal('edit-galon');
        const leeMineral = getStepperVal('edit-lee');
        if (galon === 0 && leeMineral === 0) {
          alert('Jumlah galon tidak boleh kosong.');
          return false;
        }

        const updated = { ...row, galon, leeMineral };
        if (isSetoran) {
          updated.subtotal = subtotal(galon, leeMineral, SETORAN_PRICE);
        } else {
          updated.total = subtotal(galon, leeMineral, SALES_PRICE);
        }

        await GazaDB.update(storeName, updated);
        await refreshAll();
        return true;
      };
    }

    modal.hidden = false;
  }

  byId('btn-edit-cancel').addEventListener('click', () => {
    byId('edit-modal').hidden = true;
    editSaveCallback = null;
  });

  byId('btn-edit-save').addEventListener('click', async () => {
    if (typeof editSaveCallback === 'function') {
      const success = await editSaveCallback();
      if (success) {
        byId('edit-modal').hidden = true;
        editSaveCallback = null;
      }
    }
  });

  /* ==========================================================================
     BAGIAN B: FILTER RIWAYAT & LAPORAN
     ========================================================================== */
  let riwayatDateFilter = 'today';
  let riwayatCustomDate = today();
  let riwayatEmployeeFilter = 'ALL';
  let riwayatSalesFilter = 'ALL';
  let riwayatOrderFilter = 'PENDING';
  let activeRiwayatTab = 'employee-data';

  function resetRiwayatFilters() {
    riwayatDateFilter = 'today';
    riwayatCustomDate = today();
    riwayatEmployeeFilter = 'ALL';
    riwayatSalesFilter = 'ALL';
    riwayatOrderFilter = 'PENDING';

    document.querySelectorAll('#riwayat-filter-section .filter-date-row .filter-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.dateFilter === 'today');
    });
    const customWrap = byId('riwayat-custom-date-wrap');
    if (customWrap) customWrap.hidden = true;
    const customInput = byId('riwayat-custom-date');
    if (customInput) customInput.value = today();

    document.querySelectorAll('#filter-person-employee .filter-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.personFilter === 'ALL');
    });

    document.querySelectorAll('#filter-person-sales .filter-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.salesFilter === 'ALL');
    });

    document.querySelectorAll('#filter-person-orders .filter-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.orderFilter === 'PENDING');
    });
  }

  function updateRiwayatPersonFilterRow(tabId) {
    const elEmp = byId('filter-person-employee');
    const elSales = byId('filter-person-sales');
    const elOrders = byId('filter-person-orders');
    if (elEmp) elEmp.hidden = tabId !== 'employee-data';
    if (elSales) elSales.hidden = tabId !== 'sales-data';
    if (elOrders) elOrders.hidden = tabId !== 'orders-data';
  }

  function isDateMatch(rowDate, filterType, customDateVal) {
    if (!rowDate) return false;
    const todayStr = today();
    if (filterType === 'today') {
      return rowDate === todayStr;
    }
    if (filterType === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return rowDate === getLocalDate(d);
    }
    if (filterType === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const minDateStr = getLocalDate(d);
      return rowDate >= minDateStr && rowDate <= todayStr;
    }
    if (filterType === 'custom') {
      return rowDate === (customDateVal || todayStr);
    }
    return true;
  }

  function getDateFilterSummaryLabel(filterType, customDateVal) {
    if (filterType === 'today') return 'hari ini';
    if (filterType === 'yesterday') return 'kemarin';
    if (filterType === '7days') return '7 hari terakhir';
    if (filterType === 'custom') return formatDate(customDateVal || today());
    return '';
  }

  function formatFullDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  /* ==========================================================================
     RIWAYAT (DATA PANEL RENDER DENGAN FILTER & TANPA NOMINAL UANG)
     ========================================================================== */
  async function renderData() {
    const [employeeRows, salesRows, orderRows] = await Promise.all([
      GazaDB.getAll(STORES.employeeTransactions),
      GazaDB.getAll(STORES.directSales),
      GazaDB.getAll(STORES.specialOrders)
    ]);

    const sortNewest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (b.id || 0) - (a.id || 0);

    // Tab 1: Bawa Galon
    const filteredEmployee = employeeRows
      .filter((row) => {
        if (!isDateMatch(row.tanggal, riwayatDateFilter, riwayatCustomDate)) return false;
        if (riwayatEmployeeFilter !== 'ALL' && row.employee !== riwayatEmployeeFilter) return false;
        return true;
      })
      .sort(sortNewest);

    byId('employee-data').innerHTML = filteredEmployee.length
      ? `<div class="history-card-list">
          ${filteredEmployee
            .map((row) => {
              const emp = row.employee || '';
              const nameCls = emp === 'Oleh' ? 'nama-oleh' : emp === 'Dadang' ? 'nama-dadang' : '';
              const itemText = `${row.galon} Galon${row.leeMineral > 0 ? `, ${row.leeMineral} Lee Mineral` : ''}`;
              const tipe = row.type === 'ORDER_KHUSUS' ? 'Pesanan diantar' : 'Bawa Galon';
              return `
              <div class="history-card">
                <div class="history-head">
                  <span class="history-name"><span class="${nameCls}">${escapeHtml(emp)}</span> · ${tipe}</span>
                  <span class="history-date">${escapeHtml(row.tanggal)} · ${escapeHtml(row.waktu || '')}</span>
                </div>
                <div class="history-items">📦 ${itemText}</div>
                <div class="history-actions">
                  <button type="button" class="history-btn-edit" data-edit-store="${STORES.employeeTransactions}" data-edit-id="${row.id}">Ubah</button>
                  <button type="button" class="history-btn-delete" data-delete-store="${STORES.employeeTransactions}" data-delete-id="${row.id}">Hapus</button>
                </div>
              </div>`;
            })
            .join('')}
        </div>`
      : '<p class="empty-filter-msg">Belum ada catatan untuk pilihan ini.</p>';

    // Tab 2: Jual Langsung
    const filteredSales = salesRows
      .filter((row) => {
        if (!isDateMatch(row.tanggal, riwayatDateFilter, riwayatCustomDate)) return false;
        if (riwayatSalesFilter !== 'ALL' && row.servedBy !== riwayatSalesFilter) return false;
        return true;
      })
      .sort(sortNewest);

    byId('sales-data').innerHTML = filteredSales.length
      ? `<div class="history-card-list">
          ${filteredSales
            .map((row) => {
              const itemText = `${row.galon} Galon${row.leeMineral > 0 ? `, ${row.leeMineral} Lee Mineral` : ''}`;
              const nameCls = row.servedBy === 'Oleh' ? 'nama-oleh' : row.servedBy === 'Dadang' ? 'nama-dadang' : '';
              const servedHtml = nameCls ? `<span class="${nameCls}">${escapeHtml(row.servedBy)}</span>` : escapeHtml(row.servedBy);
              return `
              <div class="history-card">
                <div class="history-head">
                  <span class="history-name">Dilayani: ${servedHtml}</span>
                  <span class="history-date">${escapeHtml(row.tanggal)} · ${escapeHtml(row.waktu || '')}</span>
                </div>
                <div class="history-items">📦 ${itemText}</div>
                <div class="history-actions">
                  <button type="button" class="history-btn-edit" data-edit-store="${STORES.directSales}" data-edit-id="${row.id}">Ubah</button>
                  <button type="button" class="history-btn-delete" data-delete-store="${STORES.directSales}" data-delete-id="${row.id}">Hapus</button>
                </div>
              </div>`;
            })
            .join('')}
        </div>`
      : '<p class="empty-filter-msg">Belum ada catatan untuk pilihan ini.</p>';

    // Tab 3: Pesanan (Belum Selesai bebas tanggal, Selesai & Semua terikat tanggal)
    const filteredOrders = orderRows
      .filter((row) => {
        if (riwayatOrderFilter === 'PENDING') {
          return row.status !== 'SELESAI';
        } else if (riwayatOrderFilter === 'DONE') {
          if (row.status !== 'SELESAI') return false;
          return isDateMatch(row.tanggal, riwayatDateFilter, riwayatCustomDate);
        } else {
          return isDateMatch(row.tanggal, riwayatDateFilter, riwayatCustomDate);
        }
      })
      .sort(sortNewest);

    byId('orders-data').innerHTML = filteredOrders.length
      ? `<div class="history-card-list">
          ${filteredOrders
            .map((row) => {
              const statusInfo = getStatusDisplay(row.status);
              const itemText = `${row.galon} Galon${row.leeMineral > 0 ? `, ${row.leeMineral} Lee Mineral` : ''}`;
              return `
              <div class="history-card">
                <div class="history-head">
                  <span class="history-name">${escapeHtml(row.customer)}</span>
                  <span class="history-date">${escapeHtml(row.tanggal)}</span>
                </div>
                <p style="margin:0 0 8px;font-size:16px;color:var(--ink-soft);">📍 ${escapeHtml(row.location || 'Lokasi belum diisi')}</p>
                <div class="history-items">📦 ${itemText}</div>
                <div style="margin-bottom:12px;">
                  <span class="order-status-badge ${statusInfo.cls}">${statusInfo.label}</span>
                </div>
                <div class="history-actions">
                  <button type="button" class="history-btn-edit" data-edit-store="${STORES.specialOrders}" data-edit-id="${row.id}">Ubah</button>
                  <button type="button" class="history-btn-delete" data-delete-store="${STORES.specialOrders}" data-delete-id="${row.id}">Hapus</button>
                </div>
              </div>`;
            })
            .join('')}
        </div>`
      : '<p class="empty-filter-msg">Belum ada catatan untuk pilihan ini.</p>';

    // Update Ringkasan Berbahasa Biasa
    const dateLabel = getDateFilterSummaryLabel(riwayatDateFilter, riwayatCustomDate);
    if (activeRiwayatTab === 'employee-data') {
      const personLabel = riwayatEmployeeFilter !== 'ALL' ? `${riwayatEmployeeFilter}, ` : '';
      byId('riwayat-filter-summary').textContent = `Menampilkan ${filteredEmployee.length} catatan ${personLabel}${dateLabel}`;
    } else if (activeRiwayatTab === 'sales-data') {
      const personLabel = riwayatSalesFilter !== 'ALL' ? `${riwayatSalesFilter}, ` : '';
      byId('riwayat-filter-summary').textContent = `Menampilkan ${filteredSales.length} catatan ${personLabel}${dateLabel}`;
    } else if (activeRiwayatTab === 'orders-data') {
      if (riwayatOrderFilter === 'PENDING') {
        byId('riwayat-filter-summary').textContent = `Menampilkan ${filteredOrders.length} pesanan belum selesai`;
      } else if (riwayatOrderFilter === 'DONE') {
        byId('riwayat-filter-summary').textContent = `Menampilkan ${filteredOrders.length} pesanan selesai, ${dateLabel}`;
      } else {
        byId('riwayat-filter-summary').textContent = `Menampilkan ${filteredOrders.length} pesanan, ${dateLabel}`;
      }
    }
  }

  /* ==========================================================================
     LAPORAN (SATU HARI, PANAH NAVIGASI, PESAN RAMAH KOSONG)
     ========================================================================== */
  function setReportDate(dateStr) {
    const todayStr = today();
    const targetDate = dateStr > todayStr ? todayStr : dateStr;
    byId('report-date').value = targetDate;

    const dYesterday = new Date();
    dYesterday.setDate(dYesterday.getDate() - 1);
    const yesterdayStr = getLocalDate(dYesterday);

    byId('btn-date-today').classList.toggle('active', targetDate === todayStr);
    byId('btn-date-yesterday').classList.toggle('active', targetDate === yesterdayStr);
    byId('btn-date-custom').classList.toggle('active', targetDate !== todayStr && targetDate !== yesterdayStr);

    byId('custom-date-wrap').hidden = (targetDate === todayStr || targetDate === yesterdayStr);
    byId('btn-report-next').disabled = (targetDate >= todayStr);
    byId('report-display-date').textContent = formatFullDate(targetDate);

    renderReport();
  }

  async function renderReport() {
    const date = byId('report-date').value || today();
    const [employeeRows, salesRows, orders, expenses] = await Promise.all([
      GazaDB.getAll(STORES.employeeTransactions),
      GazaDB.getAll(STORES.directSales),
      GazaDB.getAll(STORES.specialOrders),
      GazaDB.getAll(STORES.expenses)
    ]);

    const selectedEmployees = employeeRows.filter((row) => row.tanggal === date);
    const selectedSales = salesRows.filter((row) => row.tanggal === date);
    const selectedExpenses = expenses.filter((row) => row.tanggal === date);

    byId('report-display-date').textContent = formatFullDate(date);
    byId('btn-report-next').disabled = (date >= today());

    const hasData = selectedEmployees.length > 0 || selectedSales.length > 0 || selectedExpenses.length > 0;
    if (!hasData) {
      byId('report-summary').innerHTML = `
        <div class="empty-report-card">
          <p class="empty-report-text">Belum ada catatan di hari ini.</p>
        </div>
      `;
      return;
    }

    // Kalkulasi (TETAP SAMA DENGAN LOGIC ASLI)
    const salesGalon = selectedSales.reduce((sum, row) => sum + row.galon, 0);
    const salesLee = selectedSales.reduce((sum, row) => sum + row.leeMineral, 0);
    const salesTotal = selectedSales.reduce((sum, row) => sum + row.total, 0);

    const deposits = selectedEmployees.reduce((sum, row) => sum + row.subtotal, 0);
    const expensesTotal = selectedExpenses.reduce((sum, row) => sum + (row.nominal || 0), 0);
    const income = salesTotal + deposits;
    const netTotal = income - expensesTotal;

    const olehRows = selectedEmployees.filter((r) => r.employee === 'Oleh');
    const olehDeposit = olehRows.reduce((sum, r) => sum + r.subtotal, 0);
    const olehGalon = olehRows.reduce((sum, r) => sum + r.galon, 0);
    const olehLee = olehRows.reduce((sum, r) => sum + r.leeMineral, 0);

    const dadangRows = selectedEmployees.filter((r) => r.employee === 'Dadang');
    const dadangDeposit = dadangRows.reduce((sum, r) => sum + r.subtotal, 0);
    const dadangGalon = dadangRows.reduce((sum, r) => sum + r.galon, 0);
    const dadangLee = dadangRows.reduce((sum, r) => sum + r.leeMineral, 0);

    const detailRows = [
      ...selectedEmployees.map((row) => ({
        ...row,
        isExpense: false,
        detailType: `Setoran ${row.employee}`,
        detailDesc: `${row.galon} Galon${row.leeMineral > 0 ? `, ${row.leeMineral} Lee` : ''}`,
        amount: row.subtotal
      })),
      ...selectedSales.map((row) => ({
        ...row,
        isExpense: false,
        detailType: `Jual Langsung (${row.servedBy})`,
        detailDesc: `${row.galon} Galon${row.leeMineral > 0 ? `, ${row.leeMineral} Lee` : ''}`,
        amount: row.total
      })),
      ...selectedExpenses.map((row) => ({
        ...row,
        isExpense: true,
        detailType: 'Pengeluaran',
        detailDesc: row.keterangan || 'Pengeluaran depot',
        amount: row.nominal || 0
      }))
    ];

    detailRows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (b.id || 0) - (a.id || 0));

    byId('report-summary').innerHTML = `
      <!-- Angka Besar Paling Atas -->
      <div class="report-hero-metric">
        <div class="report-hero-label">Hasil ${formatDate(date)}</div>
        <div class="report-hero-amount">${rupiah(netTotal)}</div>
      </div>

      <!-- Accordion Rincian -->
      <div class="accordion-group">
        <!-- 1. Bawa Galon Oleh -->
        <div class="accordion-item">
          <button type="button" class="accordion-header">
            <span>Bawa Galon: Oleh</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content" hidden>
            <p>Galon: <strong>${olehGalon}</strong> | Lee Mineral: <strong>${olehLee}</strong></p>
            <p>Setoran: <strong style="color:var(--accent);">${rupiah(olehDeposit)}</strong></p>
          </div>
        </div>

        <!-- 2. Bawa Galon Dadang -->
        <div class="accordion-item">
          <button type="button" class="accordion-header">
            <span>Bawa Galon: Dadang</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content" hidden>
            <p>Galon: <strong>${dadangGalon}</strong> | Lee Mineral: <strong>${dadangLee}</strong></p>
            <p>Setoran: <strong style="color:var(--accent);">${rupiah(dadangDeposit)}</strong></p>
          </div>
        </div>

        <!-- 3. Penjualan Langsung -->
        <div class="accordion-item">
          <button type="button" class="accordion-header">
            <span>Penjualan Langsung</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content" hidden>
            <p>Galon: <strong>${salesGalon}</strong> × Rp4.000</p>
            <p>Lee Mineral: <strong>${salesLee}</strong> × Rp3.000</p>
            <p>Total Penjualan: <strong style="color:var(--accent);">${rupiah(salesTotal)}</strong></p>
          </div>
        </div>

        <!-- 4. Ringkasan Keuangan -->
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>Ringkasan Keuangan</span>
            <span class="accordion-icon">▲</span>
          </button>
          <div class="accordion-content">
            <p>Total Galon: <strong>${olehGalon + dadangGalon + salesGalon}</strong></p>
            <p>Total Lee Mineral: <strong>${olehLee + dadangLee + salesLee}</strong></p>
            <hr style="border:none;border-top:1px solid var(--line);margin:10px 0;">
            <p>Pemasukan Depot: <strong>${rupiah(income)}</strong></p>
            <p>Pengeluaran: <strong style="color:var(--danger);">${rupiah(expensesTotal)}</strong></p>
            <p style="font-size:20px;margin-top:10px;">Hasil Bersih: <strong style="color:var(--accent);">${rupiah(netTotal)}</strong></p>
          </div>
        </div>

        <!-- 5. Rincian Hari Ini -->
        <div class="accordion-item">
          <button type="button" class="accordion-header">
            <span>Rincian hari ini (${detailRows.length})</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content" hidden>
            ${
              detailRows.length
                ? detailRows
                    .map(
                      (row) => `
                    <div style="padding:10px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;">
                      <div>
                        <strong style="${row.isExpense ? 'color:var(--danger);' : ''}">${escapeHtml(row.detailType)}</strong>
                        <div style="font-size:15px;color:var(--muted);">${escapeHtml(row.waktu || '')} · ${escapeHtml(row.detailDesc)}</div>
                      </div>
                      <strong style="color:${row.isExpense ? 'var(--danger)' : 'var(--accent)'};">${row.isExpense ? '-' : '+'}${rupiah(row.amount)}</strong>
                    </div>`
                    )
                    .join('')
                : '<p class="muted-line">Tidak ada transaksi pada tanggal ini.</p>'
            }
          </div>
        </div>
      </div>
    `;

    // Accordion click handlers
    byId('report-summary')
      .querySelectorAll('.accordion-header')
      .forEach((header) => {
        header.addEventListener('click', () => {
          const item = header.closest('.accordion-item');
          const content = item.querySelector('.accordion-content');
          const icon = item.querySelector('.accordion-icon');
          const isOpen = !content.hidden;
          content.hidden = isOpen;
          item.classList.toggle('open', !isOpen);
          icon.textContent = isOpen ? '▼' : '▲';
        });
      });
  }

  // Event Listeners Filter Riwayat
  document.querySelectorAll('#riwayat-filter-section .filter-date-row .filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      riwayatDateFilter = btn.dataset.dateFilter;
      document.querySelectorAll('#riwayat-filter-section .filter-date-row .filter-chip').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      const isCustom = riwayatDateFilter === 'custom';
      byId('riwayat-custom-date-wrap').hidden = !isCustom;
      if (isCustom) {
        riwayatCustomDate = byId('riwayat-custom-date').value || today();
        byId('riwayat-custom-date').focus();
      }
      renderData();
    });
  });

  byId('riwayat-custom-date').addEventListener('change', (e) => {
    riwayatCustomDate = e.target.value || today();
    renderData();
  });

  document.querySelectorAll('#filter-person-employee .filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      riwayatEmployeeFilter = btn.dataset.personFilter;
      document.querySelectorAll('#filter-person-employee .filter-chip').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderData();
    });
  });

  document.querySelectorAll('#filter-person-sales .filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      riwayatSalesFilter = btn.dataset.salesFilter;
      document.querySelectorAll('#filter-person-sales .filter-chip').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderData();
    });
  });

  document.querySelectorAll('#filter-person-orders .filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      riwayatOrderFilter = btn.dataset.orderFilter;
      document.querySelectorAll('#filter-person-orders .filter-chip').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderData();
    });
  });

  // Event Listeners Tanggal Laporan
  byId('btn-date-today').addEventListener('click', () => setReportDate(today()));
  byId('btn-date-yesterday').addEventListener('click', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setReportDate(getLocalDate(d));
  });
  byId('btn-date-custom').addEventListener('click', () => {
    byId('custom-date-wrap').hidden = false;
    byId('btn-date-today').classList.remove('active');
    byId('btn-date-yesterday').classList.remove('active');
    byId('btn-date-custom').classList.add('active');
    byId('report-date').focus();
  });
  byId('report-date').addEventListener('change', (e) => setReportDate(e.target.value || today()));

  byId('btn-report-prev').addEventListener('click', () => {
    const cur = byId('report-date').value || today();
    const [y, m, d] = cur.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() - 1);
    setReportDate(getLocalDate(dateObj));
  });

  byId('btn-report-next').addEventListener('click', () => {
    const cur = byId('report-date').value || today();
    if (cur >= today()) return;
    const [y, m, d] = cur.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + 1);
    const nextDateStr = getLocalDate(dateObj);
    if (nextDateStr <= today()) {
      setReportDate(nextDateStr);
    }
  });

  /* Pengeluaran */
  byId('save-expense').addEventListener('click', async () => {
    const nominal = Math.max(0, Number.parseInt(byId('expense-amount').value, 10) || 0);
    const keterangan = byId('expense-description').value.trim();
    if (!nominal || !keterangan) {
      alert('Isi keterangan dan jumlah pengeluaran.');
      return;
    }
    await GazaDB.add(STORES.expenses, { ...timeParts(), keterangan, nominal });
    byId('expense-description').value = '';
    byId('expense-amount').value = '';
    byId('expense-result').textContent = 'Pengeluaran tersimpan.';
    setTimeout(() => {
      byId('expense-result').textContent = '';
    }, 2500);
    await renderReport();
  });

  /* Proteksi Laporan (PIN) */
  byId('unlock-report').addEventListener('click', () => {
    if (byId('report-password').value !== REPORT_PASSWORD) {
      byId('report-login-result').textContent = 'PIN salah. Silakan coba lagi.';
      return;
    }
    byId('report-login').hidden = true;
    byId('report-content').hidden = false;
    setReportDate(today());
  });

  /* ==========================================================================
     NAVIGASI & ROUTING TAMPILAN
     ========================================================================== */
  function showView(viewId) {
    byId('success-overlay').hidden = true;

    document.querySelectorAll('.view').forEach((view) => {
      view.hidden = view.id !== viewId;
      view.classList.toggle('active-view', view.id === viewId);
    });

    // Update Bottom Nav & Desktop Sidebar
    document.querySelectorAll('.bottom-nav-item, .sidebar-nav .nav-item').forEach((item) => {
      item.classList.toggle('active-nav', item.dataset.view === viewId);
    });

    // Perbarui judul topbar
    const titleMap = {
      'home-view': { title: 'GAZA GALON', subtitle: 'Depot Air Minum' },
      'setoran-view': { title: 'SETORAN', subtitle: 'Bawa Galon Keliling' },
      'jual-view': { title: 'JUAL LANGSUNG', subtitle: 'Pembeli Datang' },
      'pesanan-new-view': { title: 'PESANAN BARU', subtitle: 'Antar Galon' },
      'orders-list-view': { title: 'PESANAN AKTIF', subtitle: 'Belum Selesai' },
      'data-view': { title: 'RIWAYAT', subtitle: 'Catatan Depot' },
      'report-view': { title: 'LAPORAN', subtitle: 'Pemasukan & Pengeluaran' }
    };
    const scr = titleMap[viewId] || { title: 'GAZA GALON', subtitle: 'Depot Air Minum' };
    byId('screen-title').textContent = scr.title;
    byId('screen-subtitle').textContent = scr.subtitle;

    window.scrollTo({ top: 0, behavior: 'instant' });

    if (viewId === 'data-view') {
      activeRiwayatTab = 'employee-data';
      activateTab('employee-data');
    }
    if (viewId === 'orders-list-view') renderPendingOrders();
    if (viewId === 'home-view') renderPendingOrders();
  }

  function activateTab(tabId) {
    activeRiwayatTab = tabId;
    document.querySelectorAll('.tab-button').forEach((tab) => {
      tab.classList.toggle('active-tab', tab.dataset.tab === tabId);
    });
    document.querySelectorAll('.data-panel').forEach((panel) => {
      panel.hidden = panel.id !== tabId;
    });
    updateRiwayatPersonFilterRow(tabId);
    resetRiwayatFilters();
    renderData();
  }

  async function refreshAll() {
    await renderPendingOrders();
    if (!byId('data-view').hidden) await renderData();
    if (!byId('report-content').hidden) await renderReport();
  }

  /* Event Listeners Navigasi */
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });

  document.querySelectorAll('[data-back-to]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.backTo));
  });

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  // Home Card Click Events
  byId('btn-home-oleh').addEventListener('click', () => openSetoranFlow('Oleh'));
  byId('btn-home-dadang').addEventListener('click', () => openSetoranFlow('Dadang'));
  byId('btn-home-jual').addEventListener('click', openJualFlow);
  byId('btn-home-pesanan').addEventListener('click', openNewOrderFlow);

  // Server selection in Jual Langsung
  document.querySelectorAll('.server-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.server-choice-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedServerForSale = btn.dataset.server;
      updateJualFormState();
    });
  });

  // Action Buttons
  byId('btn-save-setoran').addEventListener('click', executeSaveSetoran);
  byId('btn-save-jual').addEventListener('click', executeSaveSale);
  byId('btn-save-order').addEventListener('click', executeSaveOrder);

  // Form input change listeners
  byId('order-customer-input').addEventListener('input', updateOrderFormState);
  byId('order-location-input').addEventListener('input', updateOrderFormState);

  // Delegasi Event Klik Global untuk Hapus, Selesai, Pickup, dan Edit
  document.addEventListener('click', async (event) => {
    const target = event.target;

    // Hapus dengan Custom Modal Konfirmasi
    if (target.dataset.deleteStore) {
      const storeName = target.dataset.deleteStore;
      const id = Number(target.dataset.deleteId);

      let msg = 'Hapus data ini?';
      if (storeName === STORES.employeeTransactions) {
        const item = await GazaDB.get(storeName, id);
        msg = `Hapus setoran ${item?.employee || ''} ${item?.galon || 0} Galon ini?`;
      } else if (storeName === STORES.directSales) {
        const item = await GazaDB.get(storeName, id);
        msg = `Hapus penjualan ${item?.galon || 0} Galon ini?`;
      } else if (storeName === STORES.specialOrders) {
        const item = await GazaDB.get(storeName, id);
        msg = `Hapus pesanan ${item?.customer || ''} ini?`;
      }

      showDeleteConfirmModal(msg, async () => {
        if (storeName === STORES.specialOrders) {
          const linkedTransactions = (await GazaDB.getAll(STORES.employeeTransactions)).filter(
            (t) => t.specialOrderId === id
          );
          await Promise.all(linkedTransactions.map((t) => GazaDB.delete(STORES.employeeTransactions, t.id)));
        }
        await GazaDB.delete(storeName, id);
        await refreshAll();
      });
    }

    // Pickup Order Khusus
    if (target.dataset.takeOrder) {
      const order = await GazaDB.get(STORES.specialOrders, Number(target.dataset.takeOrder));
      await updateOrder(order, target.dataset.employee);
    }

    // Selesai Order Khusus
    if (target.dataset.orderComplete) {
      const order = await GazaDB.get(STORES.specialOrders, Number(target.dataset.orderComplete));
      await markOrderComplete(order);
    }

    // Edit Modal (Pengganti prompt())
    if (target.dataset.editStore) {
      const storeName = target.dataset.editStore;
      const id = Number(target.dataset.editId);
      await openEditModal(storeName, id);
    }
  });

  // Inisialisasi awal
  byId('today-label').textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  byId('report-date').value = today();
  byId('report-display-date').textContent = formatFullDate(today());
  byId('btn-report-next').disabled = true;
  updateRiwayatPersonFilterRow('employee-data');
  resetRiwayatFilters();

  await GazaDB.open();
  await refreshAll();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () =>
      navigator.serviceWorker
        .register('./service-worker.js')
        .catch((err) => console.log('Service worker gagal didaftarkan:', err))
    );
  }
});
