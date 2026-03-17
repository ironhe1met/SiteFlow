const typeFields = document.querySelectorAll('.type-fields');
const typeInput  = document.querySelector('input[name="type"]');
const toggleBtns = document.querySelectorAll('#typeToggle .tbtn');

// Type switching
toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    toggleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const t = btn.dataset.type;
    typeInput.value = t;
    typeFields.forEach(f => {
      f.classList.toggle('hidden', f.id !== `fields-${t}`);
    });
  });
});

// File upload UI
document.querySelectorAll('.upload-area').forEach(area => {
  const input = area.querySelector('input[type=file]');
  const listId = area.dataset.target + '_list';
  const listEl = document.getElementById(listId);
  if (!listEl) return;

  let files = [];

  const render = () => {
    listEl.innerHTML = files.map((f, i) => `
      <div class="file-item">
        <span class="file-name">${f.name}</span>
        <span class="file-size">${(f.size/1024/1024).toFixed(2)} МБ</span>
        <button type="button" class="file-remove" data-i="${i}">×</button>
      </div>`).join('');
    listEl.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', () => { files.splice(+btn.dataset.i, 1); render(); });
    });
  };

  const add = newFiles => {
    Array.from(newFiles).forEach(f => {
      if (f.size > 10*1024*1024) { alert(`"${f.name}" перевищує 10 МБ`); return; }
      if (!files.find(x => x.name===f.name && x.size===f.size)) files.push(f);
    });
    render();
  };

  input.addEventListener('change', () => { add(input.files); input.value=''; });
  area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('drag'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('drag');
    add(e.dataTransfer.files);
  });

  // expose files for form submit
  area._getFiles = () => files;
});

// Form submit
document.getElementById('taskForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('formStatus');
  const type = typeInput.value;

  // Validate
  const sender = document.querySelector('[name=sender_email]').value.trim();
  if (!sender) { showStatus('Вкажіть ваш email', 'err'); return; }

  const titleField = document.querySelector(`[name=${type==='new_page'?'np_title':type==='edit_page'?'ep_title':'pub_title'}]`);
  const descField  = document.querySelector(`[name=${type==='new_page'?'np_description':type==='edit_page'?'ep_description':'pub_description'}]`);
  if (!titleField?.value.trim()) { showStatus('Вкажіть назву', 'err'); return; }
  if (!descField?.value.trim())  { showStatus('Вкажіть опис задачі', 'err'); return; }
  if (type==='edit_page' && !document.querySelector('[name=ep_page_url]')?.value.trim()) {
    showStatus('Вкажіть посилання на сторінку', 'err'); return;
  }

  // Build FormData
  const fd = new FormData();
  fd.append('type', type);
  fd.append('sender_email', sender);

  const prefix = type==='new_page'?'np_':type==='edit_page'?'ep_':'pub_';
  fd.append('title',       document.querySelector(`[name=${prefix}title]`)?.value.trim() || '');
  fd.append('description', document.querySelector(`[name=${prefix}description]`)?.value.trim() || '');
  fd.append('body_text',   document.querySelector(`[name=${prefix}body_text]`)?.value.trim() || '');
  fd.append('photo_links', document.querySelector(`[name=${prefix}photo_links]`)?.value.trim() || '');
  if (type==='edit_page') fd.append('page_url', document.querySelector('[name=ep_page_url]')?.value.trim() || '');

  // Files
  const activeSection = document.getElementById(`fields-${type}`);
  activeSection.querySelectorAll('.upload-area').forEach(area => {
    if (area._getFiles) area._getFiles().forEach(f => {
      const name = area.querySelector('input[type=file]').name;
      fd.append(name, f);
    });
  });

  btn.disabled = true;
  btn.textContent = 'Надсилаємо...';
  showStatus('', '');

  try {
    const r = await fetch('/api/tasks', { method: 'POST', body: fd });
    const data = await r.json();
    if (data.ok) {
      showStatus('Задачу надіслано!', 'ok');
      setTimeout(() => { window.location.href = `/task/${data.id}`; }, 800);
    } else {
      showStatus('Помилка: ' + (data.error || 'спробуйте ще раз'), 'err');
      btn.disabled = false; btn.textContent = 'Надіслати задачу';
    }
  } catch {
    showStatus('Помилка з\'єднання', 'err');
    btn.disabled = false; btn.textContent = 'Надіслати задачу';
  }
});

function showStatus(msg, cls) {
  const el = document.getElementById('formStatus');
  el.textContent = msg;
  el.className = 'status ' + cls;
}
