const STORAGE_KEY = 'weekend-studio-projects-v1';
const categories = ['Design', 'Code', 'Life'];
const starterProjects = [
  { id: 'seed-1', title: 'Make a tiny photo zine', category: 'Design', note: 'Twelve photos from everyday life. One afternoon, one folded sheet.', done: false },
  { id: 'seed-2', title: 'Build a Sunday playlist app', category: 'Code', note: 'A little home for songs that sound like a slow morning.', done: false },
  { id: 'seed-3', title: 'Grow something on the windowsill', category: 'Life', note: 'Start with basil. Try to remember the watering part.', done: false },
  { id: 'seed-4', title: 'Send a postcard to a friend', category: 'Life', note: 'Real paper. A stamp. Something worth checking the post for.', done: true },
];

let projects = starterProjects.map(project => ({ ...project }));
let activeFilter = 'All';
let activeStatus = 'all';
const list = document.querySelector('#project-list');
const form = document.querySelector('#idea-form');
const feedback = document.querySelector('#feedback');
const ideaDialog = document.querySelector('#idea-dialog');
let dialogClosing = false;
function openIdeaDialog(button) {
  if (ideaDialog.open || dialogClosing) return;
  const origin = button.getBoundingClientRect();
  // A hint of movement from the trigger, kept subtle on small screens.
  ideaDialog.style.setProperty('--launch-x', `${Math.max(-70, Math.min(70, origin.left + origin.width / 2 - window.innerWidth / 2))}px`);
  ideaDialog.style.setProperty('--launch-y', `${Math.max(-40, Math.min(60, origin.top + origin.height / 2 - window.innerHeight / 2))}px`);
  ideaDialog.showModal();
}
async function closeIdeaDialog() {
  if (!ideaDialog.open || dialogClosing) return;
  dialogClosing = true;
  ideaDialog.classList.add('is-closing');
  // Keep the native dialog and its focus trap alive until the exit finishes.
  await Promise.allSettled(ideaDialog.getAnimations()
    .filter(animation => animation.animationName === 'idea-pop-out')
    .map(animation => animation.finished));
  ideaDialog.close();
  ideaDialog.classList.remove('is-closing');
  dialogClosing = false;
}
document.querySelectorAll('[data-open-idea]').forEach(button => {
  button.addEventListener('click', () => openIdeaDialog(button));
});
document.querySelectorAll('[data-close-idea]').forEach(button => {
  button.addEventListener('click', closeIdeaDialog);
});
ideaDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeIdeaDialog();
});
// Only dismiss a gesture that both starts and ends outside the dialog.
let backdropPointerDown = false;
function isOutsideDialog(event) {
  const bounds = ideaDialog.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
}
ideaDialog.addEventListener('pointerdown', event => {
  backdropPointerDown = event.target === ideaDialog && isOutsideDialog(event);
});
ideaDialog.addEventListener('click', event => {
  if (backdropPointerDown && event.target === ideaDialog && isOutsideDialog(event)) closeIdeaDialog();
  backdropPointerDown = false;
});
const motionToggle = document.querySelector('.motion-toggle');
motionToggle.addEventListener('click', () => {
  const paused = document.body.toggleAttribute('data-background-paused');
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.textContent = paused ? 'Resume background' : 'Pause background';
});

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(saved) && saved.every(project => project && typeof project.id === 'string' && typeof project.title === 'string' && typeof project.note === 'string' && typeof project.done === 'boolean' && categories.includes(project.category))) {
    projects = saved;
  }
} catch {
  feedback.textContent = 'Browser storage is unavailable. You can still use the board for this visit.';
}

function saveProjects() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return true;
  } catch {
    feedback.textContent = 'Your change is on the board, but could not be saved for next time.';
    return false;
  }
}

function renderProjects() {
  // Keep unfinished ideas at the top without changing their saved order.
  const visible = projects
    .filter(project => activeFilter === 'All' || project.category === activeFilter)
    .filter(project => activeStatus === 'all' || project.done === (activeStatus === 'finished'))
    .sort((left, right) => Number(left.done) - Number(right.done));
  list.replaceChildren();
  document.querySelector('#project-count').textContent = projects.length;
  const finished = projects.filter(project => project.done).length;
  const remaining = projects.length - finished;
  document.querySelector('#progress-label').textContent = remaining
    ? `${finished} finished · ${remaining} ideas to explore`
    : projects.length ? 'Everything made. Time for a new idea!' : 'A fresh start';
  const emptyState = document.querySelector('#empty-state');
  emptyState.hidden = visible.length > 0;
  emptyState.textContent = activeStatus === 'finished'
    ? 'No finished projects here yet. Every small step counts.'
    : activeStatus === 'unfinished'
      ? 'No unfinished ideas here. Make room for something new.'
      : 'No projects here yet. Give that next idea a home.';
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === activeFilter)));

  visible.forEach(project => {
    const card = document.querySelector('#project-template').content.firstElementChild.cloneNode(true);
    card.dataset.category = project.category;
    card.classList.toggle('is-done', project.done);
    card.querySelector('.category').textContent = project.category;
    card.querySelector('.project-number').textContent = `№ ${String(projects.indexOf(project) + 1).padStart(2, '0')}`;
    card.querySelector('h3').textContent = project.title;
    card.querySelector('.project-note').textContent = project.note || 'Every good project starts somewhere.';
    const button = card.querySelector('.done-button');
    button.dataset.projectId = project.id;
    button.setAttribute('aria-pressed', String(project.done));
    button.setAttribute('aria-label', `${project.done ? 'Reopen' : 'Complete'} ${project.title}`);
    button.querySelector('.check').textContent = project.done ? '✓' : '○';
    button.querySelector('.done-label').textContent = project.done ? 'Done. Nicely made.' : 'Mark as done';
    button.addEventListener('click', () => {
      project.done = !project.done;
      feedback.textContent = project.done
        ? `“${project.title}” is finished. Make a little room to celebrate.`
        : `“${project.title}” is back on your list. Take your time.`;
      saveProjects();
      renderProjects();
      const remainingButtons = [...list.querySelectorAll('.done-button')];
      const focusTarget = remainingButtons.find(item => item.dataset.projectId === project.id)
        || remainingButtons[0] || document.querySelector('#status-filter');
      focusTarget.focus();
    });
    list.appendChild(card);
  });
}

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    renderProjects();
  });
});

document.querySelector('#status-filter').addEventListener('change', event => {
  activeStatus = event.target.value;
  renderProjects();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (dialogClosing) return;
  const titleInput = form.elements.namedItem('title');
  const title = titleInput.value.trim();
  if (!title) {
    titleInput.setCustomValidity('Give your idea a name first.');
    titleInput.reportValidity();
    return;
  }
  const category = form.elements.namedItem('category').value;
  projects.unshift({ id: crypto.randomUUID(), title, category, note: form.elements.namedItem('note').value.trim(), done: false });
  activeFilter = 'All';
  activeStatus = 'all';
  document.querySelector('#status-filter').value = activeStatus;
  feedback.textContent = `“${title}” has a home on the workbench.`;
  saveProjects();
  form.reset();
  renderProjects();
  closeIdeaDialog();
});
form.elements.namedItem('title').addEventListener('input', event => event.target.setCustomValidity(''));
renderProjects();
