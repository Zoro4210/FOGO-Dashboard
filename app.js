(() => {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const nf = new Intl.NumberFormat();
  const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
  const fmtDate = (v) => v ? dateFmt.format(new Date(v)) : '—';
  const fmtDateTime = (v) => v ? dateTimeFmt.format(new Date(v)) : '—';
  const ago = (v) => {
    if (!v) return '—';
    const s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return rtf.format(0, 'second');
    if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
    if (s < 86400 * 7) return rtf.format(-Math.floor(s / 86400), 'day');
    return fmtDate(v);
  };
  const STATUS = {
    submitted: 'Pending Review',
    awaiting_document: 'Awaiting Document',
    approved: 'Approved',
    rejected: 'Rejected',
    suspended: 'Suspended',
  };
  const pill = (status) => `<span class="pill ${esc(status)}">${esc(STATUS[status] || status || '—')}</span>`;
  const ERRORS = {
    not_admin: 'This account isn’t an administrator. Ask an existing admin to add you.',
    note_required: 'Write a reason first. The doctor sees it in the app.',
    invalid_transition: 'That action isn’t possible for this status anymore. Refresh and try again.',
    cannot_review_self: 'You can’t review your own doctor account. Ask another admin.',
    invite_exists: 'This email already has an invite. Check the Invites page.',
    invalid_email: 'Enter a valid email address, e.g. dr.name@hospital.org.',
    invalid_name: 'Enter the doctor’s full name.',
    invalid_registration: 'Enter the medical council registration number.',
    invite_not_found_or_claimed: 'That invite was already used or withdrawn. Refresh the list.',
    doctor_not_found: 'Doctor not found. Refresh the list.',
    cannot_deactivate_self: 'You can’t deactivate your own account. Ask another admin to do it.',
    reason_required: 'Write a reason first. It’s kept in the audit log.',
    account_not_found: 'That account no longer exists. Refresh the list.',
    already_deactivated: 'This account is already deactivated. Refresh the list.',
    not_deactivated: 'This account is already active. Refresh the list.',
    kit_not_found: 'That kit no longer exists. Refresh the list.',
    kit_not_claimed: 'This kit isn’t claimed anymore. Refresh the list.',
    account_deactivated: 'This doctor’s account is deactivated. Reactivate it on the Doctors page before approving.',
  };
  const errMsg = (e) => {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e);
    return ERRORS[m.trim()] || m;
  };

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' error' : '');
    el.textContent = msg;
    $('#toast-root').replaceChildren(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------------------------------------------------------- data layer
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  const cfg = window.FOGO_ADMIN_CONFIG;
  let sb = null;

  const real = {
    async rpc(fn, args) {
      const { data, error } = await sb.rpc(fn, args || {});
      if (error) throw error;
      return data;
    },
    listDoctors: () => real.rpc('admin_list_doctors', { p_status: null }),
    stats: () => real.rpc('admin_stats'),
    review: (id, decision, note) => real.rpc('admin_review_doctor', { p_doctor: id, p_decision: decision, p_note: note || null }),
    listInvites: () => real.rpc('admin_list_invites'),
    createInvite: (i) => real.rpc('admin_create_invite', { p_email: i.email, p_full_name: i.full_name, p_nmc_registration: i.nmc, p_site: i.site }),
    withdrawInvite: (email) => real.rpc('admin_withdraw_invite', { p_email: email }),
    audit: () => real.rpc('admin_list_audit', { p_limit: 300 }),
    listPatients: () => real.rpc('admin_list_patients'),
    listDoctorAccounts: () => real.rpc('admin_list_doctor_accounts'),
    listKits: () => real.rpc('admin_list_kits'),
    deactivate: (id, reason) => real.rpc('admin_deactivate_account', { p_user: id, p_reason: reason }),
    reactivate: (id, note) => real.rpc('admin_reactivate_account', { p_user: id, p_note: note || null }),
    unredeemKit: (id, reason) => real.rpc('admin_unredeem_kit', { p_kit: id, p_reason: reason }),
    async signedUrl(path) {
      const { data, error } = await sb.storage.from('doctor-documents').createSignedUrl(path, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  };

  // Demo mode (?demo): sample data only, nothing leaves the browser.
  const demo = (() => {
    const day = 86400000, now = Date.now();
    const iso = (d) => new Date(now - d * day).toISOString();
    const names = [
      ['Dr. Ananya Mishra', 'Neurology', 'AIIMS Bhubaneswar', 'OMC-41872'],
      ['Dr. Rohit Sahoo', 'Neurology', 'SCB Medical College', 'OMC-39011'],
      ['Dr. Priya Nair', 'Movement disorders', 'KIMS Bhubaneswar', 'KMC-77120'],
      ['Dr. Vikram Iyer', 'Physiotherapy', 'Apollo Hospitals', 'TNMC-55021'],
      ['Dr. Meera Das', 'Neurology', 'AMRI Hospitals', 'OMC-40333'],
      ['Dr. Arjun Patnaik', 'General medicine', 'Sum Hospital', 'OMC-38807'],
      ['Dr. Kavya Reddy', 'Neurology', 'NIMHANS', 'KMC-80114'],
      ['Dr. Sanjay Mohanty', 'Geriatrics', 'Care Hospitals', 'OMC-36720'],
      ['Dr. Farah Khan', 'Neurology', 'Manipal Hospital', 'KMC-79342'],
      ['Dr. Nikhil Rao', 'Rehabilitation', 'Hi-Tech Medical', 'OMC-41003'],
      ['Dr. Ishita Sen', 'Neurology', 'Kalinga Hospital', 'OMC-42210'],
      ['Dr. Abhay Jena', 'Neurosurgery', 'AIIMS Bhubaneswar', 'OMC-37555'],
    ];
    const statuses = ['submitted', 'submitted', 'submitted', 'approved', 'awaiting_document', 'approved', 'rejected', 'submitted', 'approved', 'awaiting_document', 'suspended', 'approved'];
    const doctors = names.map(([n, sp, site, nmc], i) => {
      const st = statuses[i];
      const reviewed = ['approved', 'rejected', 'suspended'].includes(st);
      return {
        id: `demo-${i}`, full_name: n, email: n.replace(/^Dr\. /, '').toLowerCase().replace(/\s+/g, '.') + '@hospital.org',
        phone: null, clinic: site, specialty: sp, nmc_registration: nmc, invite_site: site, invited_at: iso(20 - i),
        public_code: 'DR-' + 'ABCDEFGHJKMN'[i] + '7Q4X', verified: st === 'approved', status: st,
        document_path: st === 'awaiting_document' ? null : `demo-${i}/cert.jpg`,
        submitted_at: st === 'awaiting_document' ? null : iso(i * 0.7 + 0.2),
        reviewed_at: reviewed ? iso(i * 0.3) : null, reviewed_by_email: reviewed ? 'admin@fogo.health' : null,
        review_note: st === 'rejected' ? 'Certificate photo is blurred; registration number unreadable.' : st === 'suspended' ? 'Registration lapsed per state council.' : null,
        created_at: iso(18 - i), active_patients: st === 'approved' ? (i % 4) + 1 : 0,
      };
    });
    const invites = doctors.map((d) => ({ email: d.email, full_name: d.full_name, nmc_registration: d.nmc_registration, site: d.invite_site, invited_at: d.invited_at, claimed_by: d.id, claimed_at: d.created_at, status: d.status }))
      .concat([{ email: 'dr.tanvi.ghosh@hospital.org', full_name: 'Dr. Tanvi Ghosh', nmc_registration: 'WBMC-61200', site: 'AIIMS Bhubaneswar', invited_at: iso(1), claimed_by: null, claimed_at: null, status: null }]);
    const audit = [];
    let auditId = 100;
    const pushAudit = (action, row, oldRow, newRow) => audit.unshift({ id: auditId++, at: new Date().toISOString(), table_name: 'doctor_verifications', row_id: row, action, actor_email: 'you (demo)', old_row: oldRow, new_row: newRow });
    doctors.filter((d) => d.reviewed_at).forEach((d) => audit.push({ id: auditId++, at: d.reviewed_at, table_name: 'doctor_verifications', row_id: d.id, action: 'verify:' + ({ approved: 'approve', rejected: 'reject', suspended: 'suspend' }[d.status]), actor_email: 'admin@fogo.health', old_row: { status: 'submitted' }, new_row: { status: d.status, review_note: d.review_note } }));
    const stats = () => {
      const c = (s) => doctors.filter((d) => d.status === s).length;
      return { submitted: c('submitted'), awaiting_document: c('awaiting_document'), approved: c('approved'), rejected: c('rejected'), suspended: c('suspended'), total: doctors.length, submitted_7d: 5, signed_up_7d: 4, approved_7d: 2, rejected_7d: 1, invites_open: invites.filter((i) => !i.claimed_by).length };
    };
    // Account administration sample data (in-memory only).
    const pat = (i, name, phone, doc, link, sessions, lastDays, joined) => ({
      id: `demo-p${i}`, full_name: name, email: name.toLowerCase().replace(/\s+/g, '.') + '@example.com', phone,
      subject_id: 'SUB-' + String(1000 + i * 37), created_at: iso(joined), doctorId: doc, link_status: link,
      session_count: sessions, last_session_at: lastDays == null ? null : iso(lastDays),
      deactivated_at: null, deactivation_reason: null, deactivated_by_email: null,
    });
    const patients = [
      pat(0, 'Ramesh Kumar', '+91 98765 43210', 'demo-3', 'active', 42, 0.2, 40),
      pat(1, 'Sunita Behera', '+91 98765 11122', 'demo-5', 'active', 17, 1.5, 33),
      pat(2, 'Gopal Mohapatra', null, 'demo-8', 'pending', 3, 6, 21),
      pat(3, 'Lakshmi Pradhan', '+91 90909 77880', 'demo-3', 'active', 88, 0.1, 55),
      pat(4, 'Bishnu Sethi', null, null, null, 0, null, 9),
      pat(5, 'Anita Dash', '+91 99370 55661', 'demo-11', 'active', 26, 3, 28),
      pat(6, 'Harihar Rout', '+91 94370 22210', null, null, 12, 30, 70),
    ];
    Object.assign(patients[6], { deactivated_at: iso(12), deactivation_reason: 'Withdrew consent from the study.', deactivated_by_email: 'admin@fogo.health' });
    const kits = [
      { id: 'demo-k0', serial: 'FK-4XDEMO7K', imu_ble_id: 'C4:7A:11:90:2B:01', tactile_ble_id: 'C4:7A:11:90:2B:02', created_at: iso(60), claimed_by: 'demo-p0', claimed_at: iso(40) },
      { id: 'demo-k1', serial: 'FK-3H9TQ2MD', imu_ble_id: 'C4:7A:11:90:2C:01', tactile_ble_id: 'C4:7A:11:90:2C:02', created_at: iso(60), claimed_by: 'demo-p1', claimed_at: iso(33) },
      { id: 'demo-k2', serial: 'FK-7NRX4C8E', imu_ble_id: 'C4:7A:11:90:2D:01', tactile_ble_id: 'C4:7A:11:90:2D:02', created_at: iso(60), claimed_by: 'demo-p3', claimed_at: iso(55) },
      { id: 'demo-k3', serial: 'FK-2PLM6V5J', imu_ble_id: null, tactile_ble_id: null, created_at: iso(14), claimed_by: null, claimed_at: null },
      { id: 'demo-k4', serial: 'FK-9WQD8K3A', imu_ble_id: 'C4:7A:11:90:2E:01', tactile_ble_id: null, created_at: iso(14), claimed_by: 'demo-p6', claimed_at: iso(60) },
    ];
    // A patient removed a damaged kit from the app (release_kit, migration 012).
    audit.push({ id: auditId++, at: iso(3), table_name: 'kits', row_id: 'demo-k3', action: 'kit:release', actor_email: 'bishnu.sethi@example.com', old_row: { serial: 'FK-2PLM6V5J', claimed_by: 'demo-p4', claimed_at: iso(20) }, new_row: { serial: 'FK-2PLM6V5J' } });
    const docDeact = { 'demo-6': { at: iso(5), reason: 'Left the study site.', by: 'admin@fogo.health' } };
    const pushRaw = (table, row, action, oldRow, newRow) => audit.unshift({ id: auditId++, at: new Date().toISOString(), table_name: table, row_id: row, action, actor_email: 'you (demo)', old_row: oldRow, new_row: newRow });
    const kitFor = (p) => kits.find((k) => k.claimed_by === p.id);
    const patientRow = (p) => {
      const k = kitFor(p), d = doctors.find((x) => x.id === p.doctorId);
      const { doctorId, ...rest } = p;
      return { ...rest, kit_id: k?.id ?? null, kit_serial: k?.serial ?? null, kit_claimed_at: k?.claimed_at ?? null, doctor_name: d?.full_name ?? null };
    };
    const findAccount = (id) => {
      const p = patients.find((x) => x.id === id);
      if (p) return { role: 'patient', p };
      const d = doctors.find((x) => x.id === id);
      return d ? { role: 'doctor', d } : null;
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    return {
      async listPatients() { await sleep(100); return patients.map(patientRow); },
      async listDoctorAccounts() {
        await sleep(100);
        return doctors.map((d) => ({
          id: d.id, full_name: d.full_name, email: d.email, phone: d.phone, public_code: d.public_code, clinic: d.clinic, specialty: d.specialty,
          nmc_registration: d.nmc_registration, verification_status: d.status, verified: d.verified, created_at: d.created_at,
          active_patients: patients.filter((p) => p.doctorId === d.id && p.link_status === 'active').length,
          pending_links: patients.filter((p) => p.doctorId === d.id && p.link_status === 'pending').length,
          deactivated_at: docDeact[d.id]?.at ?? null, deactivation_reason: docDeact[d.id]?.reason ?? null, deactivated_by_email: docDeact[d.id]?.by ?? null,
        }));
      },
      async listKits() {
        await sleep(100);
        return kits.map((k) => {
          const p = patients.find((x) => x.id === k.claimed_by);
          return { ...k, patient_name: p?.full_name ?? null, patient_email: p?.email ?? null, patient_deactivated: p ? !!p.deactivated_at : false };
        });
      },
      async deactivate(id, reason) {
        if (!(reason || '').trim()) throw new Error('reason_required');
        const a = findAccount(id);
        if (!a) throw new Error('account_not_found');
        if (a.p ? a.p.deactivated_at : docDeact[id]) throw new Error('already_deactivated');
        const at = new Date().toISOString();
        let revoked = 0; const released = [];
        if (a.p) {
          Object.assign(a.p, { deactivated_at: at, deactivation_reason: reason.trim(), deactivated_by_email: 'you (demo)' });
          if (a.p.link_status) revoked = 1;
          a.p.doctorId = null; a.p.link_status = null;
          kits.filter((k) => k.claimed_by === id).forEach((k) => { released.push(k.serial); k.claimed_by = null; k.claimed_at = null; });
        } else {
          docDeact[id] = { at, reason: reason.trim(), by: 'you (demo)' };
          a.d.verified = false;
          patients.filter((p) => p.doctorId === id).forEach((p) => { revoked++; p.doctorId = null; p.link_status = null; });
        }
        pushRaw('account_status', id, 'account:deactivate', null, { role: a.role, reason: reason.trim(), revoked_links: revoked, released_kits: released });
        return { role: a.role, revoked_links: revoked, released_kits: released };
      },
      async reactivate(id, note) {
        const a = findAccount(id);
        if (!a) throw new Error('account_not_found');
        if (!(a.p ? a.p.deactivated_at : docDeact[id])) throw new Error('not_deactivated');
        if (a.p) Object.assign(a.p, { deactivated_at: null, deactivation_reason: null, deactivated_by_email: null });
        else { delete docDeact[id]; a.d.verified = a.d.status === 'approved'; }
        pushRaw('account_status', id, 'account:reactivate', null, { role: a.role, note: note || null });
        return 'active';
      },
      async unredeemKit(id, reason) {
        if (!(reason || '').trim()) throw new Error('reason_required');
        const k = kits.find((x) => x.id === id);
        if (!k) throw new Error('kit_not_found');
        if (!k.claimed_by) throw new Error('kit_not_claimed');
        pushRaw('kits', id, 'kit:unredeem', { serial: k.serial, claimed_by: k.claimed_by, claimed_at: k.claimed_at }, { serial: k.serial, reason: reason.trim() });
        k.claimed_by = null; k.claimed_at = null;
        return k.serial;
      },
      async listDoctors() { await sleep(150); return doctors.map((d) => ({ ...d })); },
      async stats() { return stats(); },
      async review(id, decision, note) {
        const d = doctors.find((x) => x.id === id);
        if (decision === 'approve' && docDeact[id]) throw new Error('account_deactivated');
        if ((decision === 'reject' || decision === 'suspend') && !(note || '').trim()) throw new Error('note_required');
        const old = { status: d.status };
        d.status = { approve: 'approved', reject: 'rejected', suspend: 'suspended' }[decision];
        d.verified = d.status === 'approved'; d.reviewed_at = new Date().toISOString(); d.reviewed_by_email = 'you (demo)'; d.review_note = note || null;
        pushAudit('verify:' + decision, id, old, { status: d.status, review_note: d.review_note });
        return d.status;
      },
      async listInvites() { return invites.map((i) => ({ ...i, status: doctors.find((d) => d.id === i.claimed_by)?.status ?? null })); },
      async createInvite(i) {
        if (invites.some((x) => x.email === i.email.toLowerCase())) throw new Error('invite_exists');
        invites.unshift({ email: i.email.toLowerCase(), full_name: i.full_name, nmc_registration: i.nmc, site: i.site, invited_at: new Date().toISOString(), claimed_by: null, claimed_at: null, status: null });
        audit.unshift({ id: auditId++, at: new Date().toISOString(), table_name: 'investigator_invites', row_id: i.email, action: 'INSERT', actor_email: 'you (demo)', old_row: null, new_row: { email: i.email } });
      },
      async withdrawInvite(email) { const k = invites.findIndex((x) => x.email === email && !x.claimed_by); if (k < 0) throw new Error('invite_not_found_or_claimed'); invites.splice(k, 1); },
      async audit() { return audit.slice(); },
      async signedUrl(path) {
        const i = Number(path.split('/')[0].split('-')[1]) || 0;
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='440'><rect width='640' height='440' fill='#fffdf6'/><rect x='18' y='18' width='604' height='404' fill='none' stroke='#0B5E75' stroke-width='4'/><text x='320' y='90' font-family='Georgia' font-size='26' text-anchor='middle' fill='#073D4C'>STATE MEDICAL COUNCIL</text><text x='320' y='130' font-family='Georgia' font-size='18' text-anchor='middle' fill='#3E4C59'>Certificate of Registration</text><text x='320' y='210' font-family='Georgia' font-size='28' text-anchor='middle' fill='#1B2733'>${esc(doctors[i].full_name)}</text><text x='320' y='260' font-family='monospace' font-size='20' text-anchor='middle' fill='#1B2733'>Reg. No. ${esc(doctors[i].nmc_registration)}</text><text x='320' y='380' font-family='sans-serif' font-size='14' text-anchor='middle' fill='#B3261E'>SAMPLE — DEMO DATA</text></svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      },
    };
  })();

  const api = DEMO ? demo : real;

  // ---------------------------------------------------------------- state
  const state = {
    view: 'doctors',
    doctors: [],
    stats: null,
    invites: [],
    audit: [],
    patients: [],
    doctorAccounts: [],
    kits: [],
    acctFilter: { patients: 'active', 'doctor-accounts': 'active', kits: 'all' },
    filter: 'submitted',
    query: '',
    sortDesc: true,
    page: 1,
    perPage: 10,
    selected: new Set(),
    open: null,
    pendingAction: null,
  };

  // ---------------------------------------------------------------- auth
  async function boot() {
    if (DEMO) { showApp('demo@fogo.health'); return; }
    if (!cfg || !cfg.SUPABASE_URL || !window.supabase) {
      showSignin();
      setSigninError('Missing config.js. Copy config.example.js to config.js and fill in the Supabase URL and publishable key.');
      $('#signin-btn').disabled = true;
      return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, storageKey: 'fogo-admin-auth' },
    });
    const { data: { session } } = await sb.auth.getSession();
    if (session) await enterIfAdmin(session.user.email);
    else showSignin();
  }

  async function enterIfAdmin(email) {
    try {
      const ok = await real.rpc('is_admin');
      if (!ok) {
        await sb.auth.signOut();
        showSignin();
        setSigninError(`${email} isn’t an administrator. Ask an existing admin to add you (see admin/README.md).`);
        return;
      }
      showApp(email);
    } catch (e) {
      showSignin();
      setSigninError(/is_admin/.test(errMsg(e)) ? 'The verification migration (010) is not applied to this project yet.' : errMsg(e));
    }
  }

  let codeSentTo = null;
  function showSignin() {
    codeSentTo = null;
    $('#app').classList.add('hidden');
    $('#signin').classList.remove('hidden');
    setCodeStep(false);
  }
  function setSigninError(msg, field) {
    const el = $('#signin-err');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
    for (const f of ['#email', '#code']) $(f).toggleAttribute('aria-invalid', !!msg && f === field);
    if (msg && field) $(field).focus();
  }
  const signinLabel = () => codeSentTo ? 'Verify & Sign In' : 'Send Code';
  function setCodeStep(on) {
    $('#code-field').classList.toggle('hidden', !on);
    $('#email-field').classList.toggle('hidden', on);
    $('#signin-back').classList.toggle('hidden', !on);
    $('#signin-btn').textContent = signinLabel();
    $('#signin-sub').textContent = on ? `Enter the code sent to ${codeSentTo}.` : 'Admins only. You’ll get a 6-digit code by email.';
    if (on) setTimeout(() => $('#code').focus(), 30);
  }
  $('#signin-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setSigninError('');
    const btn = $('#signin-btn');
    if (!codeSentTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('#email').value.trim())) {
      setSigninError(ERRORS.invalid_email, '#email');
      return;
    }
    if (codeSentTo && !/^\d{6,8}$/.test($('#code').value.trim())) {
      setSigninError('Enter the 6-digit code from the email.', '#code');
      return;
    }
    btn.disabled = true;
    btn.textContent = codeSentTo ? 'Verifying…' : 'Sending…';
    try {
      if (!codeSentTo) {
        const email = $('#email').value.trim().toLowerCase();
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw error;
        codeSentTo = email;
        setCodeStep(true);
      } else {
        const { data, error } = await sb.auth.verifyOtp({ email: codeSentTo, token: $('#code').value.trim(), type: 'email' });
        if (error) throw error;
        await enterIfAdmin(data.user.email);
      }
    } catch (e) {
      const m = errMsg(e);
      if (/signups not allowed|user not found/i.test(m)) setSigninError('No account exists for this email. Sign in to the app once first, then ask an admin to add you.', '#email');
      else if (/expired|invalid/i.test(m) && codeSentTo) setSigninError('That code is wrong or expired. Check the latest email or use a different email to resend.', '#code');
      else setSigninError(m);
    } finally {
      btn.disabled = false;
      btn.textContent = signinLabel();
    }
  });
  $('#signin-back').addEventListener('click', () => { codeSentTo = null; $('#code').value = ''; setCodeStep(false); });
  $('#signout').addEventListener('click', async () => {
    if (DEMO) { location.search = ''; return; }
    await sb.auth.signOut();
    codeSentTo = null;
    showSignin();
  });

  function showApp(email) {
    $('#signin').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#who-email').textContent = email + (DEMO ? ' · demo' : '');
    $('#who-avatar').textContent = (email[0] || 'A').toUpperCase();
    readUrl();
    setView(state.view);
    loadAll();
  }

  // ---------------------------------------------------------------- loading
  let loadingCount = 0;
  const busy = async (fn) => {
    loadingCount++; $('#loading').classList.remove('hidden');
    try { return await fn(); } finally { if (--loadingCount === 0) $('#loading').classList.add('hidden'); }
  };

  async function loadAll() {
    await busy(async () => {
      try {
        const [doctors, stats, invites] = await Promise.all([api.listDoctors(), api.stats(), api.listInvites()]);
        state.doctors = doctors || [];
        state.stats = stats;
        state.invites = invites || [];
        for (const id of [...state.selected]) if (!state.doctors.some((d) => d.id === id)) state.selected.delete(id);
        renderDoctors();
        renderInvites();
        await loadAccounts();
        if (state.view === 'audit') await loadAudit();
        if (state.open) {
          const d = state.doctors.find((x) => x.id === state.open);
          if (d) renderDrawer(d, false);
        }
      } catch (e) {
        toast(errMsg(e), 'error');
      }
    });
  }
  // Account lists load separately: if migration 011 isn’t applied yet, the other views keep working.
  async function loadAccounts() {
    const results = await Promise.allSettled([api.listPatients(), api.listDoctorAccounts(), api.listKits()]);
    const [p, d, k] = results;
    if (p.status === 'fulfilled') state.patients = p.value || [];
    if (d.status === 'fulfilled') state.doctorAccounts = d.value || [];
    if (k.status === 'fulfilled') state.kits = k.value || [];
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) toast(`Accounts and kits couldn’t load: ${errMsg(failed.reason)} If the account migration (011) isn’t applied yet, apply it and refresh.`, 'error');
    renderAccounts();
  }
  async function loadAudit() {
    try { state.audit = await api.audit() || []; renderAudit(); } catch (e) { toast(errMsg(e), 'error'); }
  }

  // ---------------------------------------------------------------- views
  const VIEWS = {
    doctors: ['Doctor Verification', 'Review registration certificates before doctors can see patient data.'],
    invites: ['Investigator Invites', 'Only invited emails can create a doctor account.'],
    patients: ['Patients', 'Patient accounts, kits and doctor links. Deactivating keeps all clinical data.'],
    'doctor-accounts': ['Doctors', 'Doctor accounts and sign-in access. Deactivating ends all patient links.'],
    kits: ['Kits', 'Every kit and who claimed it. Unredeem a kit to let another patient claim it.'],
    audit: ['Audit Log', 'Every verification decision, account change and invite change, newest first.'],
  };

  // URL holds view + list state so filters/search/page are shareable and survive reload:
  //   #doctors?status=approved&q=rao&page=2&sort=asc&per=25
  function readUrl() {
    const [v, qs] = location.hash.replace(/^#/, '').split('?');
    const p = new URLSearchParams(qs || '');
    state.view = VIEWS[v] ? v : 'doctors';
    const st = p.get('status');
    if (ACCT[state.view]) state.acctFilter[state.view] = ACCT[state.view].filters.some(([k]) => k === st) ? st : ACCT[state.view].def;
    else state.filter = FILTERS.some(([k]) => k === st) ? st : 'submitted';
    state.query = p.get('q') || '';
    state.page = Math.max(1, Number(p.get('page')) || 1);
    state.sortDesc = p.get('sort') !== 'asc';
    state.perPage = [10, 25, 50].includes(Number(p.get('per'))) ? Number(p.get('per')) : 10;
    $('#search').value = state.query;
    $('#sort-lbl').textContent = state.sortDesc ? 'Newest First' : 'Oldest First';
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.view === 'doctors') {
      if (state.filter !== 'submitted') p.set('status', state.filter);
      if (state.query) p.set('q', state.query);
      if (state.page > 1) p.set('page', state.page);
      if (!state.sortDesc) p.set('sort', 'asc');
      if (state.perPage !== 10) p.set('per', state.perPage);
    } else if (ACCT[state.view]) {
      if (state.acctFilter[state.view] !== ACCT[state.view].def) p.set('status', state.acctFilter[state.view]);
      if (state.query) p.set('q', state.query);
    }
    const qs = p.toString();
    const url = (DEMO ? '?demo' : location.pathname + location.search) + '#' + state.view + (qs ? '?' + qs : '');
    history.replaceState(null, '', url);
  }

  function setView(v) {
    if (!VIEWS[v]) v = 'doctors';
    state.view = v;
    writeUrl();
    $$('.nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === v);
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $$('.view').forEach((s) => s.classList.toggle('hidden', s.id !== 'view-' + v));
    $('#page-title').textContent = VIEWS[v][0];
    $('#page-sub').textContent = VIEWS[v][1];
    document.title = `${VIEWS[v][0]} · FOGO Admin Dashboard`;
    const sph = ACCT[v] ? ACCT[v].search : 'Search doctors…';
    $('#search').placeholder = sph;
    $('#search').previousElementSibling.textContent = sph.replace('…', '');
    setSidebar(false);
    updateSelbar();
    if (ACCT[v]) renderAccounts(v);
    if (v === 'audit') loadAudit();
  }
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  window.addEventListener('hashchange', () => {
    if ($('#app').classList.contains('hidden')) return;
    readUrl();
    setView(state.view);
    renderDoctors();
  });

  // Off-canvas sidebar on narrow screens: inert while closed so Tab skips it.
  const narrow = window.matchMedia('(max-width: 900px)');
  function setSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#side-scrim').classList.toggle('open', open);
    $('#menu-btn').setAttribute('aria-expanded', String(open));
    $('#sidebar').inert = narrow.matches && !open;
    if (open) $('#sidebar .nav-item.active')?.focus();
  }
  narrow.addEventListener('change', () => setSidebar(false));
  $('#menu-btn').addEventListener('click', () => setSidebar(true));
  $('#side-scrim').addEventListener('click', () => { setSidebar(false); $('#menu-btn').focus(); });
  $('#refresh').addEventListener('click', loadAll);

  // ---------------------------------------------------------------- doctors
  const FILTERS = [
    ['submitted', 'Pending Review'],
    ['awaiting_document', 'Awaiting Document'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
    ['suspended', 'Suspended'],
    ['all', 'All'],
  ];

  function filteredDoctors() {
    const q = state.query.trim().toLowerCase();
    let rows = state.doctors.filter((d) => state.filter === 'all' || d.status === state.filter);
    if (q) rows = rows.filter((d) => [d.full_name, d.email, d.nmc_registration, d.clinic, d.invite_site, d.public_code].some((v) => (v || '').toLowerCase().includes(q)));
    const key = (d) => new Date(d.submitted_at || d.created_at || 0).getTime();
    rows.sort((a, b) => state.sortDesc ? key(b) - key(a) : key(a) - key(b));
    return rows;
  }

  function renderStats() {
    const s = state.stats || {};
    const cells = [
      ['clock', 'Pending Review', s.submitted ?? 0, `${nf.format(s.submitted_7d ?? 0)} submitted`],
      ['file', 'Awaiting Document', s.awaiting_document ?? 0, `${nf.format(s.signed_up_7d ?? 0)} signed up`],
      ['shield', 'Approved Doctors', s.approved ?? 0, `${nf.format(s.approved_7d ?? 0)} approved`],
      ['ban', 'Rejected / Suspended', (s.rejected ?? 0) + (s.suspended ?? 0), `${nf.format(s.rejected_7d ?? 0)} decided`],
    ];
    $('#stats').innerHTML = cells.map(([ic, label, value, delta]) => `
      <div class="stat" role="group" aria-label="${esc(label)}">
        <div class="stat-label">${icon(ic)}${esc(label)}</div>
        <div class="stat-value mono">${esc(nf.format(value))}</div>
        <div class="stat-foot">Last 7 days <span class="delta">${esc(delta)}</span></div>
      </div>`).join('');
    $('#nav-pending').textContent = s.submitted ?? 0;
    $('#nav-invites').textContent = s.invites_open ?? 0;
  }

  function renderChips() {
    const counts = {};
    state.doctors.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
    $('#status-chips').innerHTML = FILTERS.map(([k, label]) => `
      <button class="chip ${state.filter === k ? 'active' : ''}" data-filter="${k}" aria-pressed="${state.filter === k}">${esc(label)}<span class="n mono">${k === 'all' ? state.doctors.length : (counts[k] || 0)}</span></button>`).join('');
    $$('#status-chips .chip').forEach((c) => c.addEventListener('click', () => {
      state.filter = c.dataset.filter; state.page = 1; state.selected.clear(); renderDoctors();
      $(`#status-chips .chip[data-filter="${c.dataset.filter}"]`)?.focus();
    }));
  }

  function renderDoctors() {
    renderStats();
    renderChips();
    const rows = filteredDoctors();
    const pages = Math.max(1, Math.ceil(rows.length / state.perPage));
    state.page = Math.min(state.page, pages);
    const pageRows = rows.slice((state.page - 1) * state.perPage, state.page * state.perPage);
    const tbody = $('#doctor-rows');
    if (!pageRows.length) {
      const label = FILTERS.find(([k]) => k === state.filter)?.[1].toLowerCase();
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8" class="empty"><b>Nothing Here</b>${state.query ? 'No doctors match your search. Try a name, email or registration number.' : `No doctors are ${esc(label)} right now.`}</td></tr>`;
    } else {
      tbody.innerHTML = pageRows.map((d) => `
        <tr data-id="${esc(d.id)}" class="${state.selected.has(d.id) ? 'selected' : ''}" tabindex="0" aria-label="Review ${esc(d.full_name)}, ${esc(STATUS[d.status] || d.status)}">
          <td class="check"><label class="check-hit"><input type="checkbox" name="select" data-check="${esc(d.id)}" ${state.selected.has(d.id) ? 'checked' : ''} aria-label="Select ${esc(d.full_name)}"></label></td>
          <td><div class="doc-name">${esc(d.full_name)}</div><div class="doc-email">${esc(d.email || d.phone || '')}</div></td>
          <td class="mono" translate="no">${esc(d.nmc_registration || '—')}</td>
          <td>${esc(d.invite_site || d.clinic || '—')}<div class="doc-email">${esc(d.specialty || '')}</div></td>
          <td class="muted">${fmtDate(d.invited_at)}</td>
          <td class="muted" title="${esc(fmtDateTime(d.submitted_at))}">${ago(d.submitted_at)}</td>
          <td>${pill(d.status)}</td>
          <td>${d.document_path ? `<span class="doc-link">${icon('file')}View</span>` : '<span class="muted">—</span>'}</td>
        </tr>`).join('');
    }
    $$('#doctor-rows tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('.check-hit')) return;
        openDrawer(tr.dataset.id);
      });
      tr.addEventListener('keydown', (ev) => {
        if (ev.target !== tr) return;
        if (ev.key === 'Enter') { ev.preventDefault(); openDrawer(tr.dataset.id); }
        if (ev.key === ' ') { ev.preventDefault(); tr.querySelector('input[data-check]').click(); }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); tr.nextElementSibling?.focus(); }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); tr.previousElementSibling?.focus(); }
      });
    });
    $$('#doctor-rows input[data-check]').forEach((cb) => cb.addEventListener('change', () => {
      cb.checked ? state.selected.add(cb.dataset.check) : state.selected.delete(cb.dataset.check);
      cb.closest('tr').classList.toggle('selected', cb.checked);
      updateSelbar();
    }));
    const all = $('#check-all');
    all.checked = pageRows.length > 0 && pageRows.every((d) => state.selected.has(d.id));
    all.indeterminate = !all.checked && pageRows.some((d) => state.selected.has(d.id));
    all.onchange = () => { pageRows.forEach((d) => all.checked ? state.selected.add(d.id) : state.selected.delete(d.id)); renderDoctors(); };

    // footer / pager
    const from = rows.length ? (state.page - 1) * state.perPage + 1 : 0;
    const to = Math.min(rows.length, state.page * state.perPage);
    const nums = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
    $('#doctor-foot').innerHTML = `
      <label for="per-page">Showing per page</label>
      <select id="per-page" name="per-page">${[10, 25, 50].map((n) => `<option ${n === state.perPage ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <span class="muted mono" aria-live="polite">${from}–${to} of ${rows.length}</span>
      <nav class="pager" aria-label="Pagination">
        <button data-p="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous Page">‹</button>
        ${nums.map((p) => p === '…' ? '<span class="pager-gap" aria-hidden="true">…</span>' : `<button data-p="${p}" class="${p === state.page ? 'active' : ''}" ${p === state.page ? 'aria-current="page"' : ''} aria-label="Page ${p}">${p}</button>`).join('')}
        <button data-p="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Next Page">›</button>
      </nav>`;
    $('#per-page').onchange = (e) => { state.perPage = Number(e.target.value); state.page = 1; renderDoctors(); };
    $$('#doctor-foot .pager button[data-p]').forEach((b) => b.addEventListener('click', () => { state.page = Number(b.dataset.p); renderDoctors(); }));
    updateSelbar();
    writeUrl();
  }

  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value; state.page = 1;
    if (ACCT[state.view]) { renderAccounts(state.view); writeUrl(); return; }
    if (state.view !== 'doctors') setView('doctors');
    renderDoctors();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#search').focus(); }
    if (e.key === 'Escape') {
      if (closeModal) closeModal();
      else if (state.open) closeDrawer();
      else if ($('#sidebar').classList.contains('open')) { setSidebar(false); $('#menu-btn').focus(); }
    }
  });
  $('#sort-btn').addEventListener('click', () => {
    state.sortDesc = !state.sortDesc;
    $('#sort-lbl').textContent = state.sortDesc ? 'Newest First' : 'Oldest First';
    renderDoctors();
  });
  $('#export-btn').addEventListener('click', () => {
    const cols = ['full_name', 'email', 'phone', 'nmc_registration', 'invite_site', 'clinic', 'specialty', 'public_code', 'status', 'invited_at', 'submitted_at', 'reviewed_at', 'reviewed_by_email', 'review_note'];
    const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...filteredDoctors().map((d) => cols.map((c) => csvCell(d[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `fogo-doctors-${state.filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // selection bar (bulk approve / reject; only rows pending review)
  function updateSelbar() {
    const n = state.selected.size;
    $('#selbar').classList.toggle('hidden', !n || state.view !== 'doctors');
    $('#sel-count').textContent = n;
  }
  $('#sel-clear').addEventListener('click', () => { state.selected.clear(); renderDoctors(); });
  $('#bulk-approve').addEventListener('click', () => bulk('approve'));
  $('#bulk-reject').addEventListener('click', () => bulk('reject'));

  async function bulk(decision) {
    const ids = [...state.selected];
    const docs = ids.map((id) => state.doctors.find((d) => d.id === id)).filter(Boolean);
    const eligible = docs.filter((d) => decision === 'approve'
      ? ['submitted', 'rejected', 'suspended'].includes(d.status) && d.document_path
      : d.status === 'submitted');
    const skipped = docs.length - eligible.length;
    if (!eligible.length) { toast(`None of the selected doctors can be ${decision === 'approve' ? 'approved' : 'rejected'}.`, 'error'); return; }
    const note = await confirmModal({
      title: decision === 'approve' ? `Approve ${eligible.length} doctor${eligible.length > 1 ? 's' : ''}?` : `Reject ${eligible.length} doctor${eligible.length > 1 ? 's' : ''}?`,
      body: (decision === 'approve'
        ? 'They will immediately be able to link with patients and see their data. Make sure you have opened each certificate.'
        : 'They will see your reason and can upload a new document.') + (skipped ? ` ${skipped} selected doctor${skipped > 1 ? 's are' : ' is'} not eligible and will be skipped.` : ''),
      needNote: decision === 'reject',
      confirm: `${decision === 'approve' ? 'Approve' : 'Reject'} ${eligible.length} Doctor${eligible.length > 1 ? 's' : ''}`,
      kind: decision === 'approve' ? 'approve' : 'danger',
    });
    if (note === null) return;
    await busy(async () => {
      let ok = 0; const failed = [];
      for (const d of eligible) {
        try { await api.review(d.id, decision, note); ok++; } catch (e) { failed.push(`${d.full_name}: ${errMsg(e)}`); }
      }
      state.selected.clear();
      toast(failed.length ? `${ok} done, ${failed.length} failed — ${failed[0]}` : `${ok} doctor${ok > 1 ? 's' : ''} ${decision === 'approve' ? 'approved' : 'rejected'}.`, failed.length ? 'error' : undefined);
    });
    await loadAll();
  }

  // ---------------------------------------------------------------- drawer
  let previewToken = 0;
  let drawerReturnFocus = null;
  function openDrawer(id) {
    const d = state.doctors.find((x) => x.id === id);
    if (!d) return;
    drawerReturnFocus = document.activeElement;
    state.open = id;
    state.pendingAction = null;
    renderDrawer(d, true);
    const drawer = $('#drawer');
    drawer.inert = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    $('#app').inert = true;
    $('#selbar').inert = true;
    $('#drawer-scrim').classList.add('open');
    $('#drawer-close').focus();
  }
  function closeDrawer() {
    if (!state.open) return;
    const id = state.open;
    state.open = null;
    const drawer = $('#drawer');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    $('#app').inert = false;
    $('#selbar').inert = false;
    $('#drawer-scrim').classList.remove('open');
    // Return focus to the row that opened it (it may have been re-rendered).
    const target = (drawerReturnFocus && document.contains(drawerReturnFocus)) ? drawerReturnFocus : $(`#doctor-rows tr[data-id="${CSS.escape(id)}"]`);
    target?.focus();
  }
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-scrim').addEventListener('click', closeDrawer);

  function renderDrawer(d, reloadPreview) {
    $('#d-name').textContent = d.full_name;
    $('#d-email').textContent = d.email || d.phone || '';
    const st = $('#d-status');
    st.className = 'pill ' + d.status;
    st.textContent = STATUS[d.status] || d.status;
    const rows = [
      ['Registration No.', d.nmc_registration, true],
      ['Invited Site', d.invite_site],
      ['Clinic', d.clinic],
      ['Specialty', d.specialty],
      ['Phone', d.phone, true],
      ['Doctor ID', d.public_code, true],
      ['Invited', fmtDateTime(d.invited_at)],
      ['Signed Up', fmtDateTime(d.created_at)],
      ['Document Submitted', fmtDateTime(d.submitted_at)],
      ['Active Patients', nf.format(d.active_patients ?? 0)],
    ];
    $('#d-details').innerHTML = rows.map(([k, v, code]) => `<dt>${esc(k)}</dt><dd class="${code ? 'mono' : ''}" ${code ? 'translate="no"' : ''}>${esc(v ?? '—') || '—'}</dd>`).join('');
    $('#d-history').innerHTML = d.reviewed_at
      ? `${pill(d.status)} by <b>${esc(d.reviewed_by_email || 'unknown')}</b> · ${esc(fmtDateTime(d.reviewed_at))}${d.review_note ? `<div style="margin-top:8px;overflow-wrap:anywhere">“${esc(d.review_note)}”</div>` : ''}`
      : '<span class="muted">Not reviewed yet.</span>';

    if (reloadPreview) loadPreview(d);
    renderActions(d);
  }

  async function loadPreview(d) {
    const box = $('#d-preview');
    const open = $('#d-open');
    open.innerHTML = '';
    if (!d.document_path) { box.innerHTML = '<div class="ph">The doctor has not uploaded a document yet.</div>'; return; }
    const token = ++previewToken;
    box.innerHTML = '<div class="ph">Loading document…</div>';
    try {
      const url = await api.signedUrl(d.document_path);
      if (token !== previewToken) return;
      const isPdf = /\.pdf$/i.test(d.document_path);
      box.innerHTML = isPdf
        ? `<iframe src="${esc(url)}" title="Registration certificate of ${esc(d.full_name)}"></iframe>`
        : `<img src="${esc(url)}" alt="Registration certificate of ${esc(d.full_name)}" width="640" height="440" decoding="async" style="width:auto;height:auto">`;
      open.innerHTML = `<a class="doc-link" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')}Open Full Size</a> <span class="hint">· Link expires in 10&nbsp;minutes</span>`;
      const img = box.querySelector('img');
      if (img) img.onerror = () => { box.innerHTML = '<div class="ph">This file type can’t be previewed here (e.g. HEIC). Use “Open Full Size” below.</div>'; };
    } catch (e) {
      if (token === previewToken) box.innerHTML = `<div class="ph">Couldn’t load the document: ${esc(errMsg(e))}. Close and reopen the panel to retry.</div>`;
    }
  }

  function renderActions(d) {
    const actions = [];
    if (['submitted', 'rejected', 'suspended'].includes(d.status) && d.document_path) actions.push(['approve', d.status === 'suspended' ? 'Reinstate' : 'Approve', 'approve', 'check']);
    if (d.status === 'submitted') actions.push(['reject', 'Reject', 'danger', 'x']);
    if (['approved', 'submitted'].includes(d.status)) actions.push(['suspend', 'Suspend', 'danger', 'ban']);
    const pending = state.pendingAction;
    const noteField = $('#d-note-field');
    noteField.classList.toggle('hidden', !(pending === 'reject' || pending === 'suspend'));
    $('#d-note-label').textContent = pending === 'suspend' ? 'Reason for suspension (shown to the doctor)' : 'Reason (shown to the doctor)';
    $('#d-err').classList.add('hidden');
    $('#d-note').removeAttribute('aria-invalid');
    $('#d-foot').classList.toggle('hidden', !actions.length);
    if (pending) {
      const a = actions.find((x) => x[0] === pending);
      $('#d-actions').innerHTML = `
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn ${a[2] === 'approve' ? 'approve' : 'danger-solid'}" data-act="confirm">${icon(a[3])}${esc(a[1])} Doctor</button>`;
    } else {
      $('#d-actions').innerHTML = actions.map(([k, label, cls, ic]) => `<button class="btn ${cls}" data-act="${k}">${icon(ic)}${esc(label)}</button>`).join('');
    }
    $$('#d-actions button').forEach((b) => b.addEventListener('click', () => onAction(d, b.dataset.act)));
    if (pending === 'reject' || pending === 'suspend') setTimeout(() => $('#d-note').focus(), 30);
  }

  async function onAction(d, act) {
    if (act === 'cancel') { state.pendingAction = null; $('#d-note').value = ''; renderActions(d); return; }
    if (act !== 'confirm') {
      if (act === 'approve') {
        const ok = await confirmModal({
          title: `${d.status === 'suspended' ? 'Reinstate' : 'Approve'} ${d.full_name}?`,
          body: 'They’ll immediately be able to link with patients and see their data. Make sure you’ve checked the certificate.',
          confirm: d.status === 'suspended' ? 'Reinstate Doctor' : 'Approve Doctor',
          kind: 'approve',
        });
        if (ok === null) return;
        return submitReview(d, 'approve', null);
      }
      state.pendingAction = act; renderActions(d); return;
    }
    const decision = state.pendingAction;
    const note = $('#d-note').value.trim();
    if (!note) {
      const e = $('#d-err'); e.textContent = ERRORS.note_required; e.classList.remove('hidden');
      $('#d-note').setAttribute('aria-invalid', 'true'); $('#d-note').focus();
      return;
    }
    await submitReview(d, decision, note);
  }

  async function submitReview(d, decision, note) {
    $$('#d-actions button').forEach((b) => { b.disabled = true; });
    const confirmBtn = $('#d-actions [data-act="confirm"]') || $('#d-actions [data-act="approve"]');
    if (confirmBtn) confirmBtn.lastChild.textContent = ({ approve: 'Approving…', reject: 'Rejecting…', suspend: 'Suspending…' })[decision];
    try {
      await busy(() => api.review(d.id, decision, note));
      toast(`${d.full_name} ${({ approve: 'approved', reject: 'rejected', suspend: 'suspended' })[decision]}.`);
      state.pendingAction = null;
      $('#d-note').value = '';
      await loadAll();
    } catch (e) {
      renderActions(d);
      const el = $('#d-err'); el.textContent = errMsg(e); el.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------- modal
  // One modal at a time. Background is inert while open; focus returns to the opener.
  let closeModal = null;
  function openModal(innerHtml, onDismiss) {
    const root = $('#modal-root');
    const returnFocus = document.activeElement;
    const behind = [$('#app'), $('#drawer'), $('#selbar')];
    const wasInert = behind.map((el) => el.inert);
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${innerHtml}</div>`;
    behind.forEach((el) => { el.inert = true; });
    let open = true;
    const close = () => {
      if (!open) return;
      open = false;
      closeModal = null;
      root.replaceChildren();
      behind.forEach((el, i) => { el.inert = wasInert[i]; });
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    };
    closeModal = () => { if (!open) return; close(); onDismiss?.(); };
    root.querySelector('[data-x]')?.addEventListener('click', closeModal);
    root.querySelector('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal')) closeModal(); });
    return { root, close };
  }

  // needNote: reason required. optionalNote: textarea shown but may stay empty (resolves '').
  // noteLabel / notePlaceholder / noteError override the doctor-review defaults.
  function confirmModal({ title, body, needNote, optionalNote, noteLabel, notePlaceholder, noteError, confirm: confirmLabel, kind }) {
    const hasNote = !!(needNote || optionalNote);
    return new Promise((resolve) => {
      const { root, close } = openModal(`
          <form class="modal-card" novalidate>
            <h3 id="modal-title">${esc(title)}</h3>
            <div class="muted">${esc(body)}</div>
            ${hasNote ? `<div class="field"><label for="m-note">${esc(noteLabel || 'Reason (shown to the doctors)')}</label><textarea id="m-note" name="review-note" rows="3" maxlength="1000" autocomplete="off" placeholder="${esc(notePlaceholder || 'e.g. Certificate is blurred, please upload a clearer photo…')}" aria-describedby="m-err"></textarea><div class="err hidden" id="m-err" role="alert"></div></div>` : ''}
            <div class="modal-actions">
              <button type="button" class="btn" data-x>Cancel</button>
              <button type="submit" class="btn ${kind === 'approve' ? 'approve' : 'danger-solid'}">${esc(confirmLabel)}</button>
            </div>
          </form>`, () => resolve(null));
      root.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const n = hasNote ? root.querySelector('#m-note').value.trim() : '';
        if (needNote && !n) {
          const err = root.querySelector('#m-err');
          err.textContent = noteError || ERRORS.note_required; err.classList.remove('hidden');
          root.querySelector('#m-note').setAttribute('aria-invalid', 'true');
          root.querySelector('#m-note').focus();
          return;
        }
        close();
        resolve(n);
      };
      (root.querySelector('#m-note') || root.querySelector('button[type=submit]')).focus();
    });
  }

  // ---------------------------------------------------------------- invites
  function renderInvites() {
    const tbody = $('#invite-rows');
    if (!state.invites.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty"><b>No Invites Yet</b>Use “Invite Doctor” to register an investigator’s email.</td></tr>'; return; }
    tbody.innerHTML = state.invites.map((i) => `
      <tr style="cursor:default">
        <td><div class="doc-name">${esc(i.full_name)}</div><div class="doc-email">${esc(i.email)}</div></td>
        <td class="mono" translate="no">${esc(i.nmc_registration)}</td>
        <td>${esc(i.site || '—')}</td>
        <td class="muted">${fmtDate(i.invited_at)}</td>
        <td class="muted">${i.claimed_at ? fmtDate(i.claimed_at) : '—'}</td>
        <td>${i.claimed_by ? pill(i.status) : '<span class="pill open">Not Signed Up</span>'}</td>
        <td style="text-align:right">${i.claimed_by ? '' : `<button class="btn sm danger" data-withdraw="${esc(i.email)}" aria-label="Withdraw invite for ${esc(i.email)}">Withdraw</button>`}</td>
      </tr>`).join('');
    $$('#invite-rows [data-withdraw]').forEach((b) => b.addEventListener('click', async () => {
      const email = b.dataset.withdraw;
      const ok = await confirmModal({
        title: 'Withdraw Invite?',
        body: `${email} won’t be able to sign up as a doctor. You can invite them again later.`,
        confirm: 'Withdraw Invite',
        kind: 'danger',
      });
      if (ok === null) return;
      try { await busy(() => api.withdrawInvite(email)); toast('Invite withdrawn.'); await loadAll(); } catch (e) { toast(errMsg(e), 'error'); }
    }));
  }

  $('#new-invite').addEventListener('click', () => {
    const { root, close } = openModal(`
        <form class="modal-card" autocomplete="off" novalidate>
          <h3 id="modal-title">Invite a Doctor</h3>
          <div class="muted">They sign up in the app with this email, then upload their registration certificate for you to review.</div>
          <div class="field"><label for="iv-email">Email</label><input id="iv-email" name="invite-email" type="email" autocomplete="off" spellcheck="false" placeholder="dr.name@hospital.org" aria-describedby="iv-err"></div>
          <div class="field"><label for="iv-name">Full Name</label><input id="iv-name" name="invite-name" autocomplete="off" placeholder="Dr. Full Name…" aria-describedby="iv-err"></div>
          <div class="field"><label for="iv-nmc">Medical Council Registration No.</label><input id="iv-nmc" name="invite-registration" autocomplete="off" spellcheck="false" placeholder="e.g. OMC-12345…" aria-describedby="iv-err" translate="no"></div>
          <div class="field"><label for="iv-site">Site <span class="hint">(optional)</span></label><input id="iv-site" name="invite-site" autocomplete="off" placeholder="Hospital or study site…"></div>
          <div class="err hidden" id="iv-err" role="alert"></div>
          <div class="modal-actions">
            <button type="button" class="btn" data-x>Cancel</button>
            <button type="submit" class="btn primary">${icon('plus')}<span>Create Invite</span></button>
          </div>
        </form>`);
    const field = (id) => root.querySelector(id);
    const showErr = (msg, id) => {
      const el = field('#iv-err'); el.textContent = msg; el.classList.remove('hidden');
      $$('input', root).forEach((i) => i.removeAttribute('aria-invalid'));
      if (id) { field(id).setAttribute('aria-invalid', 'true'); field(id).focus(); }
    };
    field('#iv-email').focus();
    root.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const v = { email: field('#iv-email').value.trim(), full_name: field('#iv-name').value.trim(), nmc: field('#iv-nmc').value.trim(), site: field('#iv-site').value.trim() };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return showErr(ERRORS.invalid_email, '#iv-email');
      if (!v.full_name) return showErr(ERRORS.invalid_name, '#iv-name');
      if (!v.nmc) return showErr(ERRORS.invalid_registration, '#iv-nmc');
      const btn = root.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.lastElementChild.textContent = 'Creating…';
      try {
        await api.createInvite(v);
        close();
        toast('Invite created.');
        await loadAll();
        setView('invites');
      } catch (err) {
        const code = (err.message || '').trim();
        showErr(errMsg(err), code === 'invalid_email' || code === 'invite_exists' ? '#iv-email' : code === 'invalid_name' ? '#iv-name' : code === 'invalid_registration' ? '#iv-nmc' : null);
        btn.disabled = false;
        btn.lastElementChild.textContent = 'Create Invite';
      }
    };
  });

  // ---------------------------------------------------------------- accounts (patients, doctors, kits)
  const ACCT = {
    patients: {
      filters: [['active', 'Active'], ['deactivated', 'Deactivated'], ['all', 'All']], def: 'active', cols: 8,
      search: 'Search patients…', list: () => state.patients, isIn: (r, f) => f === 'all' || (f === 'active') === !r.deactivated_at,
      fields: (r) => [r.full_name, r.email, r.phone, r.subject_id, r.kit_serial, r.doctor_name],
      noun: 'patients', hint: 'a name, email, subject ID or kit serial',
    },
    'doctor-accounts': {
      filters: [['active', 'Active'], ['deactivated', 'Deactivated'], ['all', 'All']], def: 'active', cols: 8,
      search: 'Search doctors…', list: () => state.doctorAccounts, isIn: (r, f) => f === 'all' || (f === 'active') === !r.deactivated_at,
      fields: (r) => [r.full_name, r.email, r.phone, r.public_code, r.nmc_registration, r.clinic, r.specialty],
      noun: 'doctors', hint: 'a name, email, doctor ID or registration number',
    },
    kits: {
      filters: [['claimed', 'Claimed'], ['unclaimed', 'Unclaimed'], ['all', 'All']], def: 'all', cols: 6,
      search: 'Search kits…', list: () => state.kits, isIn: (r, f) => f === 'all' || (f === 'claimed') === !!r.claimed_by,
      fields: (r) => [r.serial, r.imu_ble_id, r.tactile_ble_id, r.patient_name, r.patient_email],
      noun: 'kits', hint: 'a serial, module ID or patient name',
    },
  };
  const activePill = (r) => r.deactivated_at ? '<span class="pill suspended">Deactivated</span>' : '<span class="pill approved">Active</span>';
  const deactNote = (r) => r.deactivated_at ? `<div class="doc-email" title="${esc(r.deactivation_reason || '')}">${esc(fmtDate(r.deactivated_at))}${r.deactivated_by_email ? ` · ${esc(r.deactivated_by_email)}` : ''}</div>` : '';
  const acctBtn = (r, kind) => {
    const name = r.full_name || r.email || 'account';
    return r.deactivated_at
      ? `<button class="btn sm" data-act="reactivate" data-id="${esc(r.id)}" aria-label="Reactivate ${esc(name)}">Reactivate</button>`
      : `<button class="btn sm danger" data-act="deactivate" data-id="${esc(r.id)}" aria-label="Deactivate ${esc(name)}">Deactivate</button>`;
  };
  const LINK = { pending: 'Link pending', active: 'Linked' };
  const ROWS = {
    patients: (r) => `
      <tr style="cursor:default">
        <td><div class="doc-name">${esc(r.full_name || '—')}</div><div class="doc-email">${esc(r.email || r.phone || '')}</div></td>
        <td class="mono" translate="no">${esc(r.subject_id || '—')}</td>
        <td class="mono" translate="no">${esc(r.kit_serial || '—')}</td>
        <td>${r.doctor_name ? `${esc(r.doctor_name)}<div class="doc-email">${esc(LINK[r.link_status] || r.link_status || '')}</div>` : '<span class="muted">—</span>'}</td>
        <td><span class="mono">${esc(nf.format(r.session_count ?? 0))}</span>${r.last_session_at ? `<div class="doc-email" title="${esc(fmtDateTime(r.last_session_at))}">Last ${esc(ago(r.last_session_at))}</div>` : ''}</td>
        <td class="muted">${esc(fmtDate(r.created_at))}</td>
        <td>${activePill(r)}${deactNote(r)}</td>
        <td style="text-align:right">${acctBtn(r)}</td>
      </tr>`,
    'doctor-accounts': (r) => `
      <tr style="cursor:default">
        <td><div class="doc-name">${esc(r.full_name || '—')}</div><div class="doc-email">${esc(r.email || r.phone || '')}</div></td>
        <td class="mono" translate="no">${esc(r.public_code || '—')}</td>
        <td class="mono" translate="no">${esc(r.nmc_registration || '—')}</td>
        <td>${esc(r.clinic || '—')}<div class="doc-email">${esc(r.specialty || '')}</div></td>
        <td>${pill(r.verification_status)}</td>
        <td><span class="mono">${esc(nf.format(r.active_patients ?? 0))}</span>${r.pending_links ? `<div class="doc-email">${esc(nf.format(r.pending_links))} pending</div>` : ''}</td>
        <td>${activePill(r)}${deactNote(r)}</td>
        <td style="text-align:right">${acctBtn(r)}</td>
      </tr>`,
    kits: (r) => `
      <tr style="cursor:default">
        <td class="mono doc-name" translate="no">${esc(r.serial)}</td>
        <td class="mono" translate="no"><div class="doc-email">IMU ${esc(r.imu_ble_id || '—')}</div><div class="doc-email">Tactile ${esc(r.tactile_ble_id || '—')}</div></td>
        <td>${r.claimed_by ? `<div class="doc-name">${esc(r.patient_name || '—')}${r.patient_deactivated ? ' <span class="muted" style="font-weight:500;font-size:12px">(deactivated)</span>' : ''}</div><div class="doc-email">${esc(r.patient_email || '')}</div>` : '<span class="pill neutral">Unclaimed</span>'}</td>
        <td class="muted">${esc(fmtDate(r.claimed_at))}</td>
        <td class="muted">${esc(fmtDate(r.created_at))}</td>
        <td style="text-align:right">${r.claimed_by ? `<button class="btn sm danger" data-act="unredeem" data-id="${esc(r.id)}" aria-label="Unredeem kit ${esc(r.serial)}">Unredeem</button>` : ''}</td>
      </tr>`,
  };

  function renderAccounts(only) {
    for (const view of only ? [only] : Object.keys(ACCT)) {
      const cfg = ACCT[view];
      const all = cfg.list();
      const f = state.acctFilter[view];
      const q = state.query.trim().toLowerCase();
      let rows = all.filter((r) => cfg.isIn(r, f));
      if (q) rows = rows.filter((r) => cfg.fields(r).some((v) => (v || '').toLowerCase().includes(q)));
      $(`#chips-${view}`).innerHTML = cfg.filters.map(([k, label]) => `
        <button class="chip ${f === k ? 'active' : ''}" data-filter="${k}" aria-pressed="${f === k}">${esc(label)}<span class="n mono">${all.filter((r) => cfg.isIn(r, k)).length}</span></button>`).join('');
      $$(`#chips-${view} .chip`).forEach((c) => c.addEventListener('click', () => {
        state.acctFilter[view] = c.dataset.filter; renderAccounts(view); writeUrl();
        $(`#chips-${view} .chip[data-filter="${c.dataset.filter}"]`)?.focus();
      }));
      const label = cfg.filters.find(([k]) => k === f)?.[1].toLowerCase();
      $(`#rows-${view}`).innerHTML = rows.length ? rows.map(ROWS[view]).join('')
        : `<tr class="empty-row"><td colspan="${cfg.cols}" class="empty"><b>Nothing Here</b>${q ? `No ${cfg.noun} match your search. Try ${cfg.hint}.` : f === 'all' ? `No ${cfg.noun} yet.` : `No ${cfg.noun} are ${esc(label)} right now. Try another filter above.`}</td></tr>`;
    }
    $('#nav-patients').textContent = state.patients.filter((r) => !r.deactivated_at).length;
    $('#nav-kits').textContent = state.kits.filter((r) => r.claimed_by).length;
  }

  for (const view of Object.keys(ACCT)) {
    $(`#rows-${view}`).addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      const list = view === 'kits' ? state.kits : view === 'patients' ? state.patients : state.doctorAccounts;
      const r = list.find((x) => x.id === b.dataset.id);
      if (!r) return;
      if (b.dataset.act === 'unredeem') unredeemKit(r);
      else if (b.dataset.act === 'deactivate') deactivateAccount(view === 'patients' ? 'patient' : 'doctor', r);
      else reactivateAccount(view === 'patients' ? 'patient' : 'doctor', r);
    });
  }

  const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
  async function deactivateAccount(role, r) {
    const name = r.full_name || r.email || `this ${role}`;
    const Role = role === 'patient' ? 'Patient' : 'Doctor';
    const body = role === 'patient'
      ? 'They can’t sign in to the app anymore, their doctor links end and their kit is released so it can be claimed again. All sessions and clinical data are kept. You can reactivate the account later.'
      : 'They can’t sign in anymore, all patient links end and they are marked as unverified. All clinical data and notes are kept. You can reactivate the account later.';
    const note = await confirmModal({
      title: `Deactivate ${name}?`, body, needNote: true,
      noteLabel: 'Reason (kept in the audit log)', notePlaceholder: 'e.g. Withdrew consent, or left the study site…', noteError: ERRORS.reason_required,
      confirm: `Deactivate ${Role}`, kind: 'danger',
    });
    if (note === null) return;
    try {
      const res = await busy(() => api.deactivate(r.id, note)) || {};
      const kitsOut = res.released_kits || [];
      toast([`${name} deactivated`, plural(res.revoked_links ?? 0, 'link ended', 'links ended'), kitsOut.length ? `${kitsOut.length === 1 ? 'kit' : 'kits'} ${kitsOut.join(', ')} released` : null].filter(Boolean).join(' · '));
      await loadAll();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function reactivateAccount(role, r) {
    const name = r.full_name || r.email || `this ${role}`;
    const note = await confirmModal({
      title: `Reactivate ${name}?`,
      body: `They can sign in again. Doctor links and kits are not restored.${role === 'doctor' ? ' They regain access to patient data only if their verification is approved.' : ''}`,
      optionalNote: true, noteLabel: 'Note (optional, kept in the audit log)', notePlaceholder: 'e.g. Returned to the study…',
      confirm: `Reactivate ${role === 'patient' ? 'Patient' : 'Doctor'}`, kind: 'approve',
    });
    if (note === null) return;
    try {
      await busy(() => api.reactivate(r.id, note || null));
      toast(`${name} reactivated.`);
      await loadAll();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function unredeemKit(k) {
    const who = k.patient_name || 'the patient';
    const note = await confirmModal({
      title: `Unredeem Kit ${k.serial}?`,
      body: `The kit becomes unclaimed and another patient can claim it. Past sessions stay with ${who}. ${who === 'the patient' ? 'Their' : `${who}’s`} app will no longer have this kit linked in the cloud.`,
      needNote: true, noteLabel: 'Reason (kept in the audit log)', notePlaceholder: 'e.g. Kit returned, or claimed on the wrong account…', noteError: ERRORS.reason_required,
      confirm: 'Unredeem Kit', kind: 'danger',
    });
    if (note === null) return;
    try {
      await busy(() => api.unredeemKit(k.id, note));
      toast(`Kit ${k.serial} unredeemed.`);
      await loadAll();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  // ---------------------------------------------------------------- audit
  function auditLabel(a) {
    if (a.action === 'account:deactivate') return 'Account Deactivated';
    if (a.action === 'account:reactivate') return 'Account Reactivated';
    if (a.action === 'kit:unredeem') return 'Kit Unredeemed';
    if (a.action === 'kit:release') return 'Kit Released by Patient';
    if (a.action.startsWith('verify:')) return ({ 'verify:approve': 'Approved', 'verify:reject': 'Rejected', 'verify:suspend': 'Suspended' })[a.action] || a.action;
    const t = { investigator_invites: 'Invite', doctor_verifications: 'Verification', doctors: 'Doctor', admins: 'Admin', account_status: 'Account', kits: 'Kit' }[a.table_name] || a.table_name;
    return `${t} ${({ INSERT: 'created', UPDATE: 'changed', DELETE: 'deleted' })[a.action] || a.action.toLowerCase()}`;
  }
  function auditChange(a) {
    const o = a.old_row || {}, n = a.new_row || {};
    const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && !['updated_at'].includes(k));
    if (!keys.length) return '<span class="muted">—</span>';
    return keys.slice(0, 4).map((k) => `<div><span class="muted">${esc(k)}:</span> ${o[k] !== undefined ? `${esc(fmtVal(o[k]))} → ` : ''}<b>${esc(fmtVal(n[k]))}</b></div>`).join('') + (keys.length > 4 ? `<div class="muted">+${keys.length - 4} more</div>` : '');
  }
  const fmtVal = (v) => { if (v === null || v === undefined) return '∅'; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
  function recordName(a) {
    const d = state.doctors.find((x) => x.id === a.row_id)
      || state.patients.find((x) => x.id === a.row_id)
      || state.doctorAccounts.find((x) => x.id === a.row_id);
    if (d) return d.full_name || d.email || a.row_id;
    const k = a.table_name === 'kits' ? state.kits.find((x) => x.id === a.row_id) : null;
    return k ? k.serial : (a.new_row?.serial || a.old_row?.serial || a.row_id);
  }
  function renderAudit() {
    const tbody = $('#audit-rows');
    if (!state.audit.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty"><b>No Entries Yet</b>Decisions you make will appear here.</td></tr>'; return; }
    tbody.innerHTML = state.audit.map((a) => {
      const verify = a.action.startsWith('verify:');
      const cls = verify ? ({ 'verify:approve': 'approved', 'verify:reject': 'rejected', 'verify:suspend': 'suspended' })[a.action]
        : ({ 'account:deactivate': 'suspended', 'account:reactivate': 'approved' })[a.action] || 'neutral';
      return `<tr style="cursor:default">
        <td class="muted" title="${esc(fmtDateTime(a.at))}">${esc(fmtDateTime(a.at))}</td>
        <td><span class="pill ${cls}">${esc(auditLabel(a))}</span></td>
        <td${a.table_name === 'kits' ? ' class="mono" translate="no"' : ''}>${esc(recordName(a))}</td>
        <td>${esc(a.actor_email || 'SQL editor / system')}</td>
        <td style="white-space:normal;font-size:12.5px;min-width:260px">${auditChange(a)}</td>
      </tr>`;
    }).join('');
  }

  boot();
})();
