const searchInput = document.getElementById('searchInput');
const cards = [...document.querySelectorAll('.game-card')];
const categories = [...document.querySelectorAll('.cat')];
const favorites = [...document.querySelectorAll('.favorite')];
const shuffleBtn = document.getElementById('shuffleBtn');
const grid = document.getElementById('gamesGrid');

searchInput.addEventListener('input', () => {
  const term = searchInput.value.toLowerCase().trim();

  cards.forEach(card => {
    const name = card.dataset.name.toLowerCase();
    card.style.display = name.includes(term) ? 'block' : 'none';
  });
});

categories.forEach(cat => {
  cat.addEventListener('click', () => {
    categories.forEach(item => item.classList.remove('active'));
    cat.classList.add('active');

    const filter = cat.dataset.filter;

    cards.forEach(card => {
      const category = card.dataset.category;
      const show = filter === 'all' || category.includes(filter);
      card.style.display = show ? 'block' : 'none';
    });
  });
});

favorites.forEach(button => {
  button.addEventListener('click', event => {
    event.stopPropagation();
    button.classList.toggle('active');
    button.textContent = button.classList.contains('active') ? '♥' : '♡';
  });
});

shuffleBtn.addEventListener('click', () => {
  const gameCards = cards.sort(() => Math.random() - 0.5);
  gameCards.forEach(card => grid.insertBefore(card, shuffleBtn));
});

const authTabs = [...document.querySelectorAll('.auth-tab')];
const authForms = [...document.querySelectorAll('.auth-form')];

authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const target = tab.dataset.tab;
    authForms.forEach(form => {
      form.classList.toggle('active', form.id === target + 'Form');
    });
  });
});

// User session management
const userPanel = document.getElementById('userPanel');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const userLevel = document.getElementById('userLevel');
const userAvatar = document.getElementById('userAvatar');
const userInfoClickable = document.getElementById('userInfoClickable');
const playerInfoPanel = document.getElementById('playerInfoPanel');
const closePlayerInfo = document.getElementById('closePlayerInfo');
const editPlayerInfoBtn = document.getElementById('editPlayerInfo');
const savePlayerInfoBtn = document.getElementById('savePlayerInfo');
const cancelEditPlayerInfoBtn = document.getElementById('cancelEditPlayerInfo');
const playerUsernameDisplay = document.getElementById('playerUsernameDisplay');
const playerEmailDisplay = document.getElementById('playerEmailDisplay');
const playerLevelDisplay = document.getElementById('playerLevelDisplay');
const playerAvatarDisplay = document.getElementById('playerAvatarDisplay');
const playerXpDisplay = document.getElementById('playerXpDisplay');
const playerFavoritesDisplay = document.getElementById('playerFavoritesDisplay');
const playerHoursDisplay = document.getElementById('playerHoursDisplay');
const editUsername = document.getElementById('editUsername');
const editEmail = document.getElementById('editEmail');
const editLevel = document.getElementById('editLevel');
const editAvatar = document.getElementById('editAvatar');

let isEditing = false;

function checkUserSession() {
  const user = localStorage.getItem('rivardosplay_user');
  if (user) {
    const userData = JSON.parse(user);
    userName.textContent = userData.username;
    userLevel.textContent = userData.level || Math.floor(Math.random() * 50) + 1;
    userAvatar.textContent = getRandomAvatar();
    
    // Fill player info display
    playerUsernameDisplay.textContent = userData.username;
    playerEmailDisplay.textContent = userData.email || 'user@example.com';
    playerLevelDisplay.textContent = userData.level || Math.floor(Math.random() * 50) + 1;
    playerAvatarDisplay.textContent = userData.avatar || '🛡️';
    playerXpDisplay.textContent = `${Math.floor(Math.random() * 1500)}/1500`;
    playerFavoritesDisplay.textContent = Math.floor(Math.random() * 20) + 5;
    playerHoursDisplay.textContent = `${Math.floor(Math.random() * 200)}h`;
    
    // Fill edit fields (except level which is system-controlled)
    editUsername.value = userData.username;
    editEmail.value = userData.email || '';
    editAvatar.value = userData.avatar || '🛡️';
    
    userPanel.style.display = 'flex';
    loginBtn.style.display = 'none';
  }
}

function toggleEditMode() {
  isEditing = !isEditing;
  
  if (isEditing) {
    // Show inputs, hide display values
    document.querySelectorAll('.display-value').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.edit-input').forEach(el => {
      el.style.display = 'inline-block';
    });
    editPlayerInfoBtn.textContent = 'Salvar Alterações';
    // Don't allow level editing - it's system-controlled
    editLevel.disabled = true;
    editLevel.style.display = 'none';
    document.querySelector('.info-item:nth-child(3) .info-label').style.display = 'none';
  } else {
    // Hide inputs, show display values
    document.querySelectorAll('.display-value').forEach(el => {
      el.style.display = 'inline';
    });
    document.querySelectorAll('.edit-input').forEach(el => {
      el.style.display = 'none';
    });
    editPlayerInfoBtn.textContent = 'Editar';
    // Show level label again
    document.querySelector('.info-item:nth-child(3) .info-label').style.display = 'inline';
    editLevel.style.display = 'none';
  }
}

if (userInfoClickable) {
  userInfoClickable.addEventListener('click', () => {
    playerInfoPanel.classList.toggle('active');
    // Reset to view mode when opening
    if (isEditing) {
      toggleEditMode();
    }
  });
}

if (closePlayerInfo) {
  closePlayerInfo.addEventListener('click', () => {
    playerInfoPanel.classList.remove('active');
    // Reset to view mode when closing
    if (isEditing) {
      toggleEditMode();
    }
  });
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (playerInfoPanel && !playerInfoPanel.contains(e.target) && !userInfoClickable.contains(e.target)) {
    playerInfoPanel.classList.remove('active');
    // Reset to view mode when closing via outside click
    if (isEditing) {
      toggleEditMode();
    }
  }
});

if (editPlayerInfoBtn) {
  editPlayerInfoBtn.addEventListener('click', toggleEditMode);
}

if (savePlayerInfoBtn) {
  savePlayerInfoBtn.addEventListener('click', () => {
    if (!isEditing) return;
    
    const updatedUser = {
      id: Date.now(), // In real app, this would come from DB
      username: editUsername.value.trim(),
      email: editEmail.value.trim(),
      avatar: editAvatar.value,
      level: parseInt(playerLevelDisplay.textContent) // Keep current level (system-controlled)
    };
    
    // Basic validation
    if (!updatedUser.username) {
      alert('Nome de usuário é obrigatório');
      return;
    }
    
    if (!updatedUser.email || !updatedUser.email.includes('@')) {
      alert('Email válido é obrigatório');
      return;
    }
    
    // Save to localStorage
    localStorage.setItem('rivardosplay_user', JSON.stringify(updatedUser));
    
    // Update display
    checkUserSession();
    
    // Exit edit mode
    toggleEditMode();
    
    // Show success feedback
    savePlayerInfoBtn.textContent = 'Salvo!';
    setTimeout(() => {
      savePlayerInfoBtn.textContent = 'Salvar';
    }, 1000);
  });
}

if (cancelEditPlayerInfoBtn) {
  cancelEditPlayerInfoBtn.addEventListener('click', () => {
    if (isEditing) {
      toggleEditMode();
    }
    playerInfoPanel.classList.remove('active');
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('rivardosplay_user');
    userPanel.style.display = 'none';
    loginBtn.style.display = 'inline-flex';
    playerInfoPanel.classList.remove('active');
    location.reload();
  });
}

function getRandomAvatar() {
  const avatars = ['🛡️', '⚔️', '🎯', '🏁', '🚩', '🎮', '💎', '👑', '🎪', '🚀', '👾', '👻'];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// Existing code from before...
checkUserSession();