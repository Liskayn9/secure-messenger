const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

console.log('🚀 Starting Advanced Secure Messenger...');

const app = express();
const server = http.createServer(app);

// Настройки CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔥 ПЕРСИСТЕНТНАЯ БАЗА ДАННЫХ
const DATA_DIR = './data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

// Создаем директорию для данных если не существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Функции для работы с данными
function loadData(file, defaultValue = []) {
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки данных:', error);
  }
  return defaultValue;
}

function saveData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Ошибка сохранения данных:', error);
    return false;
  }
}

// Загружаем данные при старте
let users = loadData(USERS_FILE);
let friends = loadData(FRIENDS_FILE);
let messages = loadData(MESSAGES_FILE);
let groups = loadData(GROUPS_FILE);
let onlineUsers = new Map();

// Функции для сохранения данных
function saveUsers() { saveData(USERS_FILE, users); }
function saveFriends() { saveData(FRIENDS_FILE, friends); }
function saveMessages() { saveData(MESSAGES_FILE, messages); }
function saveGroups() { saveData(GROUPS_FILE, groups); }

// Генерация ID
function generateUserID() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}

function generateGroupId() {
  return 'G' + Math.floor(100000 + Math.random() * 900000).toString();
}

// Middleware аутентификации
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Токен отсутствует' });
  }

  try {
    const user = jwt.verify(token, 'super-secret-key-2024');
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Неверный токен' });
  }
};

// 🔥 API РОУТЫ

// Проверка здоровья сервера
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Сервер работает!',
    timestamp: new Date().toISOString(),
    usersCount: users.length,
    messagesCount: messages.length,
    groupsCount: groups.length
  });
});

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Валидация
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Логин должен содержать минимум 3 символа' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }
    
    // Проверка существующего пользователя
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
      return res.status(400).json({ error: 'Этот логин уже занят' });
    }
    
    // Создание пользователя
    const userid = generateUserID();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: generateId(),
      userid,
      username,
      password: hashedPassword,
      theme: 'light',
      isOnline: false,
      lastSeen: new Date(),
      createdAt: new Date(),
      status: '💭 В сети',
      avatar: null,
      pinnedChats: []
    };
    
    users.push(user);
    saveUsers();
    console.log('✅ Новый пользователь:', username, 'ID:', userid);
    
    // Генерация токена
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        userid: user.userid 
      }, 
      'super-secret-key-2024', 
      { expiresIn: '30d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        userid: user.userid,
        username: user.username,
        theme: user.theme,
        status: user.status,
        pinnedChats: user.pinnedChats
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход в систему
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    
    // Обновление статуса
    user.isOnline = true;
    user.lastSeen = new Date();
    saveUsers();
    
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        userid: user.userid 
      }, 
      'super-secret-key-2024', 
      { expiresIn: rememberMe ? '30d' : '1d' }
    );
    
    console.log('✅ Успешный вход:', username);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        userid: user.userid,
        username: user.username,
        theme: user.theme,
        isOnline: true,
        status: user.status,
        pinnedChats: user.pinnedChats
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение профиля
app.get('/api/user/profile', authenticateToken, (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        userid: user.userid,
        username: user.username,
        theme: user.theme,
        status: user.status,
        createdAt: user.createdAt,
        pinnedChats: user.pinnedChats
      }
    });
  } catch (error) {
    console.error('❌ Ошибка профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ДРУЗЬЯ

// Добавление в друзья
app.post('/api/friends/add', authenticateToken, (req, res) => {
  try {
    const { userid } = req.body;
    const fromUserId = req.user.userId;
    
    const toUser = users.find(u => u.userid === userid);
    if (!toUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (toUser.id === fromUserId) {
      return res.status(400).json({ error: 'Нельзя добавить самого себя' });
    }
    
    const existingFriendship = friends.find(f => 
      (f.user1 === fromUserId && f.user2 === toUser.id) ||
      (f.user1 === toUser.id && f.user2 === fromUserId)
    );
    
    if (existingFriendship) {
      return res.status(400).json({ error: 'Пользователь уже в друзьях' });
    }
    
    const friendship = {
      id: generateId(),
      user1: fromUserId,
      user2: toUser.id,
      createdAt: new Date()
    };
    
    friends.push(friendship);
    saveFriends();
    console.log('✅ Добавлен в друзья:', req.user.username, '→', toUser.username);
    
    // Уведомление получателя
    const recipientSocketId = onlineUsers.get(toUser.id);
    if (recipientSocketId) {
      const fromUser = users.find(u => u.id === fromUserId);
      io.to(recipientSocketId).emit('friend_added', {
        username: fromUser.username,
        userId: fromUser.userid
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Пользователь добавлен в друзья',
      friend: {
        id: toUser.id,
        userid: toUser.userid,
        username: toUser.username,
        isOnline: toUser.isOnline
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка добавления в друзья:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удаление из друзей
app.delete('/api/friends/remove/:friendId', authenticateToken, (req, res) => {
  try {
    const friendIndex = friends.findIndex(f => 
      (f.user1 === req.user.userId && f.user2 === req.params.friendId) ||
      (f.user1 === req.params.friendId && f.user2 === req.user.userId)
    );
    
    if (friendIndex === -1) {
      return res.status(404).json({ error: 'Друг не найден' });
    }
    
    friends.splice(friendIndex, 1);
    saveFriends();
    
    res.json({ success: true, message: 'Пользователь удален из друзей' });
  } catch (error) {
    console.error('❌ Ошибка удаления друга:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение списка друзей
app.get('/api/friends', authenticateToken, (req, res) => {
  try {
    const userFriends = friends
      .filter(f => f.user1 === req.user.userId || f.user2 === req.user.userId)
      .map(f => {
        const friendId = f.user1 === req.user.userId ? f.user2 : f.user1;
        const friend = users.find(u => u.id === friendId);
        const lastMessage = messages
          .filter(m => 
            (m.from === req.user.userId && m.to === friendId) ||
            (m.from === friendId && m.to === req.user.userId)
          )
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        return {
          id: friend.id,
          userid: friend.userid,
          username: friend.username,
          isOnline: friend.isOnline,
          lastSeen: friend.lastSeen,
          status: friend.status,
          lastMessage: lastMessage ? {
            message: lastMessage.message,
            timestamp: lastMessage.timestamp,
            isOwn: lastMessage.from === req.user.userId
          } : null,
          isPinned: req.user.pinnedChats?.includes(friend.id) || false
        };
      })
      .sort((a, b) => {
        // Сначала закрепленные, потом онлайн, потом по последнему сообщению
        if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned;
        if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
        if (a.lastMessage && b.lastMessage) {
          return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
        }
        return 0;
      });
    
    res.json({ success: true, friends: userFriends });
  } catch (error) {
    console.error('❌ Ошибка получения друзей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ГРУППОВЫЕ ЧАТЫ

// Создание группы
app.post('/api/groups/create', authenticateToken, (req, res) => {
  try {
    const { name, members } = req.body;
    
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({ error: 'Название и участники обязательны' });
    }
    
    const group = {
      id: generateGroupId(),
      name,
      creator: req.user.userId,
      members: [req.user.userId, ...members],
      createdAt: new Date(),
      isGroup: true
    };
    
    groups.push(group);
    saveGroups();
    
    console.log('✅ Создана группа:', name, 'участников:', group.members.length);
    
    res.json({ 
      success: true, 
      message: 'Группа создана',
      group: {
        id: group.id,
        name: group.name,
        members: group.members.length
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка создания группы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение групп пользователя
app.get('/api/groups', authenticateToken, (req, res) => {
  try {
    const userGroups = groups
      .filter(g => g.members.includes(req.user.userId))
      .map(group => {
        const lastMessage = messages
          .filter(m => m.to === group.id)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        const membersInfo = group.members.map(memberId => {
          const user = users.find(u => u.id === memberId);
          return user ? {
            id: user.id,
            username: user.username,
            isOnline: user.isOnline
          } : null;
        }).filter(Boolean);
        
        return {
          id: group.id,
          name: group.name,
          members: membersInfo,
          memberCount: membersInfo.length,
          lastMessage: lastMessage ? {
            message: lastMessage.message,
            timestamp: lastMessage.timestamp,
            from: lastMessage.from
          } : null,
          isPinned: req.user.pinnedChats?.includes(group.id) || false
        };
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned;
        if (a.lastMessage && b.lastMessage) {
          return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
        }
        return 0;
      });
    
    res.json({ success: true, groups: userGroups });
  } catch (error) {
    console.error('❌ Ошибка получения групп:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 СООБЩЕНИЯ

// Получение сообщений (личные и групповые)
app.get('/api/messages/:chatId', authenticateToken, (req, res) => {
  try {
    const { chatId } = req.params;
    const isGroup = chatId.startsWith('G');
    
    let chatMessages = [];
    
    if (isGroup) {
      // Групповые сообщения
      chatMessages = messages
        .filter(msg => msg.to === chatId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(-200);
    } else {
      // Личные сообщения
      chatMessages = messages
        .filter(msg =>
          (msg.from === req.user.userId && msg.to === chatId) ||
          (msg.from === chatId && msg.to === req.user.userId)
        )
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(-200);
    }
    
    const messagesWithDetails = chatMessages.map(msg => {
      const fromUser = users.find(u => u.id === msg.from);
      return {
        id: msg.id,
        from: fromUser.username,
        fromId: msg.from,
        message: msg.message,
        timestamp: msg.timestamp,
        isRead: msg.isRead || false,
        reactions: msg.reactions || {},
        isForwarded: msg.isForwarded || false,
        forwardedFrom: msg.forwardedFrom || null
      };
    });
    
    res.json({ success: true, messages: messagesWithDetails });
  } catch (error) {
    console.error('❌ Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 РЕАКЦИИ НА СООБЩЕНИЯ

app.post('/api/messages/react', authenticateToken, (req, res) => {
  try {
    const { messageId, reaction } = req.body;
    
    const message = messages.find(m => m.id === messageId);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    
    if (!message.reactions) {
      message.reactions = {};
    }
    
    // Переключаем реакцию
    if (message.reactions[req.user.userId] === reaction) {
      delete message.reactions[req.user.userId];
    } else {
      message.reactions[req.user.userId] = reaction;
    }
    
    saveMessages();
    
    // Отправляем обновление всем участникам чата
    const chatParticipants = message.to.startsWith('G') 
      ? groups.find(g => g.id === message.to)?.members || []
      : [message.from, message.to];
    
    chatParticipants.forEach(participantId => {
      const socketId = onlineUsers.get(participantId);
      if (socketId) {
        io.to(socketId).emit('message_reaction', {
          messageId,
          reactions: message.reactions
        });
      }
    });
    
    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    console.error('❌ Ошибка реакции:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ПЕРЕСЫЛКА СООБЩЕНИЙ

app.post('/api/messages/forward', authenticateToken, (req, res) => {
  try {
    const { messageIds, toChatIds } = req.body;
    
    if (!messageIds || !toChatIds || !Array.isArray(messageIds) || !Array.isArray(toChatIds)) {
      return res.status(400).json({ error: 'Неверные данные' });
    }
    
    const originalMessages = messages.filter(m => messageIds.includes(m.id));
    
    originalMessages.forEach(originalMsg => {
      toChatIds.forEach(chatId => {
        const forwardedMessage = {
          id: generateId(),
          from: req.user.userId,
          to: chatId,
          message: originalMsg.message,
          timestamp: new Date(),
          isRead: false,
          isForwarded: true,
          forwardedFrom: originalMsg.from
        };
        
        messages.push(forwardedMessage);
        
        // Отправляем уведомление участникам чата
        const chatParticipants = chatId.startsWith('G')
          ? groups.find(g => g.id === chatId)?.members || []
          : [chatId];
        
        chatParticipants.forEach(participantId => {
          const socketId = onlineUsers.get(participantId);
          if (socketId) {
            const fromUser = users.find(u => u.id === req.user.userId);
            const originalFromUser = users.find(u => u.id === originalMsg.from);
            
            io.to(socketId).emit('new_message', {
              id: forwardedMessage.id,
              from: fromUser.username,
              to: chatId,
              message: `📨 Переслано от ${originalFromUser.username}: ${originalMsg.message}`,
              timestamp: forwardedMessage.timestamp,
              isForwarded: true
            });
          }
        });
      });
    });
    
    saveMessages();
    
    res.json({ success: true, message: 'Сообщения пересланы' });
  } catch (error) {
    console.error('❌ Ошибка пересылки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ЗАКРЕПЛЕНИЕ ЧАТОВ

app.post('/api/chats/pin', authenticateToken, (req, res) => {
  try {
    const { chatId } = req.body;
    const user = users.find(u => u.id === req.user.userId);
    
    if (!user.pinnedChats) {
      user.pinnedChats = [];
    }
    
    if (user.pinnedChats.includes(chatId)) {
      // Открепляем
      user.pinnedChats = user.pinnedChats.filter(id => id !== chatId);
    } else {
      // Закрепляем
      user.pinnedChats.push(chatId);
    }
    
    saveUsers();
    
    res.json({ 
      success: true, 
      message: user.pinnedChats.includes(chatId) ? 'Чат закреплен' : 'Чат откреплен',
      pinnedChats: user.pinnedChats 
    });
  } catch (error) {
    console.error('❌ Ошибка закрепления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ПОИСК ПО СООБЩЕНИЯМ

app.get('/api/messages/search/:query', authenticateToken, (req, res) => {
  try {
    const { query } = req.params;
    const { chatId } = req.query;
    
    let searchMessages = messages;
    
    if (chatId) {
      // Поиск в конкретном чате
      if (chatId.startsWith('G')) {
        searchMessages = messages.filter(m => m.to === chatId);
      } else {
        searchMessages = messages.filter(m =>
          (m.from === req.user.userId && m.to === chatId) ||
          (m.from === chatId && m.to === req.user.userId)
        );
      }
    } else {
      // Поиск по всем чатам пользователя
      const userFriends = friends
        .filter(f => f.user1 === req.user.userId || f.user2 === req.user.userId)
        .map(f => f.user1 === req.user.userId ? f.user2 : f.user1);
      
      const userGroups = groups
        .filter(g => g.members.includes(req.user.userId))
        .map(g => g.id);
      
      searchMessages = messages.filter(m =>
        (m.from === req.user.userId && (userFriends.includes(m.to) || userGroups.includes(m.to))) ||
        (userFriends.includes(m.from) && m.to === req.user.userId) ||
        (userGroups.includes(m.to) && m.to.startsWith('G'))
      );
    }
    
    const results = searchMessages
      .filter(m => m.message.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50) // Ограничиваем результаты
      .map(msg => {
        const fromUser = users.find(u => u.id === msg.from);
        const chatName = msg.to.startsWith('G') 
          ? groups.find(g => g.id === msg.to)?.name 
          : users.find(u => u.id === (msg.to === req.user.userId ? msg.from : msg.to))?.username;
        
        return {
          id: msg.id,
          message: msg.message,
          timestamp: msg.timestamp,
          from: fromUser.username,
          chatId: msg.to,
          chatName: chatName || 'Неизвестный чат',
          isGroup: msg.to.startsWith('G')
        };
      });
    
    res.json({ success: true, results, query });
  } catch (error) {
    console.error('❌ Ошибка поиска:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ОСТАЛЬНЫЕ ФУНКЦИИ

app.put('/api/user/status', authenticateToken, (req, res) => {
  try {
    const { status } = req.body;
    const userIndex = users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex !== -1) {
      users[userIndex].status = status || '💭 В сети';
      saveUsers();
      console.log('📝 Статус обновлен:', req.user.username, '→', status);
      
      // Уведомляем друзей
      const userFriends = friends.filter(f => 
        f.user1 === req.user.userId || f.user2 === req.user.userId
      );
      
      userFriends.forEach(f => {
        const friendId = f.user1 === req.user.userId ? f.user2 : f.user1;
        const friendSocketId = onlineUsers.get(friendId);
        if (friendSocketId) {
          io.to(friendSocketId).emit('friend_status_changed', {
            userId: req.user.userId,
            status: status
          });
        }
      });
    }
    
    res.json({ success: true, message: 'Статус обновлен' });
  } catch (error) {
    console.error('❌ Ошибка обновления статуса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/api/user/theme', authenticateToken, (req, res) => {
  try {
    const { theme } = req.body;
    const userIndex = users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex !== -1) {
      users[userIndex].theme = theme;
      saveUsers();
      console.log('🎨 Тема изменена:', req.user.username, '→', theme);
    }
    
    res.json({ success: true, message: 'Тема изменена' });
  } catch (error) {
    console.error('❌ Ошибка смены темы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 SOCKET.IO ЛОГИКА

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Токен отсутствует'));
    }
    
    const decoded = jwt.verify(token, 'super-secret-key-2024');
    const user = users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return next(new Error('Пользователь не найден'));
    }
    
    socket.userId = user.id;
    socket.username = user.username;
    next();
  } catch (error) {
    next(new Error('Ошибка авторизации'));
  }
});

io.on('connection', (socket) => {
  console.log('✅ Подключился:', socket.username);
  
  // Обновление статуса онлайн
  const userIndex = users.findIndex(u => u.id === socket.userId);
  if (userIndex !== -1) {
    users[userIndex].isOnline = true;
    users[userIndex].lastSeen = new Date();
    saveUsers();
  }
  
  onlineUsers.set(socket.userId, socket.id);
  
  // Уведомление друзей о подключении
  const userFriends = friends.filter(f => 
    f.user1 === socket.userId || f.user2 === socket.userId
  );
  
  userFriends.forEach(f => {
    const friendId = f.user1 === socket.userId ? f.user2 : f.user1;
    const friendSocketId = onlineUsers.get(friendId);
    if (friendSocketId) {
      socket.to(friendSocketId).emit('friend_online', { 
        userId: socket.userId 
      });
    }
  });
  
  // Отправка сообщения
  socket.on('send_message', (data) => {
    try {
      const { to, message, isVoice } = data;
      
      if (!to || (!message?.trim() && !isVoice)) {
        return socket.emit('error', { message: 'Сообщение не может быть пустым' });
      }
      
      const newMessage = {
        id: generateId(),
        from: socket.userId,
        to: to,
        message: message?.trim() || '🎤 Голосовое сообщение',
        timestamp: new Date(),
        isRead: false,
        isVoice: isVoice || false,
        reactions: {}
      };
      
      messages.push(newMessage);
      saveMessages();
      
      const fromUser = users.find(u => u.id === socket.userId);
      
      const messageData = {
        id: newMessage.id,
        from: fromUser.username,
        fromId: socket.userId,
        to: to,
        message: newMessage.message,
        timestamp: newMessage.timestamp,
        isRead: false,
        isVoice: newMessage.isVoice,
        reactions: {}
      };
      
      // Отправка отправителю
      socket.emit('new_message', messageData);
      
      // Отправка получателям
      if (to.startsWith('G')) {
        // Групповое сообщение
        const group = groups.find(g => g.id === to);
        if (group) {
          group.members.forEach(memberId => {
            if (memberId !== socket.userId) {
              const memberSocketId = onlineUsers.get(memberId);
              if (memberSocketId) {
                socket.to(memberSocketId).emit('new_message', messageData);
                socket.to(memberSocketId).emit('play_notification_sound');
              }
            }
          });
        }
      } else {
        // Личное сообщение
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) {
          socket.to(recipientSocketId).emit('new_message', messageData);
          socket.to(recipientSocketId).emit('play_notification_sound');
        }
      }
      
      console.log('💬 Сообщение отправлено:', fromUser.username, '→', to);
      
    } catch (error) {
      console.error('❌ Ошибка отправки сообщения:', error);
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });
  
  // Остальные socket обработчики...
  socket.on('typing_start', (data) => {
    const { chatId } = data;
    if (chatId.startsWith('G')) {
      const group = groups.find(g => g.id === chatId);
      if (group) {
        group.members.forEach(memberId => {
          if (memberId !== socket.userId) {
            const memberSocketId = onlineUsers.get(memberId);
            if (memberSocketId) {
              socket.to(memberSocketId).emit('friend_typing', {
                userId: socket.userId,
                username: socket.username,
                chatId: chatId
              });
            }
          }
        });
      }
    } else {
      const friendSocketId = onlineUsers.get(chatId);
      if (friendSocketId) {
        socket.to(friendSocketId).emit('friend_typing', {
          userId: socket.userId,
          username: socket.username,
          chatId: chatId
        });
      }
    }
  });
  
  socket.on('typing_stop', (data) => {
    const { chatId } = data;
    if (chatId.startsWith('G')) {
      const group = groups.find(g => g.id === chatId);
      if (group) {
        group.members.forEach(memberId => {
          if (memberId !== socket.userId) {
            const memberSocketId = onlineUsers.get(memberId);
            if (memberSocketId) {
              socket.to(memberSocketId).emit('friend_stop_typing', {
                userId: socket.userId,
                chatId: chatId
              });
            }
          }
        });
      }
    } else {
      const friendSocketId = onlineUsers.get(chatId);
      if (friendSocketId) {
        socket.to(friendSocketId).emit('friend_stop_typing', {
          userId: socket.userId,
          chatId: chatId
        });
      }
    }
  });
  
  // Отключение
  socket.on('disconnect', () => {
    console.log('❌ Отключился:', socket.username);
    
    const userIndex = users.findIndex(u => u.id === socket.userId);
    if (userIndex !== -1) {
      users[userIndex].isOnline = false;
      users[userIndex].lastSeen = new Date();
      saveUsers();
    }
    
    onlineUsers.delete(socket.userId);
    
    // Уведомление друзей об отключении
    userFriends.forEach(f => {
      const friendId = f.user1 === socket.userId ? f.user2 : f.user1;
      const friendSocketId = onlineUsers.get(friendId);
      if (friendSocketId) {
        socket.to(friendSocketId).emit('friend_offline', { 
          userId: socket.userId 
        });
      }
    });
  });
});

// 🔥 ЗАПУСК СЕРВЕРА

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('🎉 Продвинутый мессенджер успешно запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🌐 Ссылка: http://localhost:${PORT}`);
  console.log(`💾 Данные сохраняются в: ${DATA_DIR}`);
  console.log(`👥 Пользователей: ${users.length}`);
  console.log(`💬 Сообщений: ${messages.length}`);
  console.log(`👪 Групп: ${groups.length}`);
});

module.exports = app;