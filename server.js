const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

console.log('🚀 Starting Secure Messenger...');

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
let onlineUsers = new Map();

// Функции для сохранения данных
function saveUsers() { saveData(USERS_FILE, users); }
function saveFriends() { saveData(FRIENDS_FILE, friends); }
function saveMessages() { saveData(MESSAGES_FILE, messages); }

// Генерация ID
function generateUserID() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 5);
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
    messagesCount: messages.length
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
      avatar: null
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
        status: user.status
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
        status: user.status
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
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Ошибка профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 🔥 ИСПРАВЛЕНИЕ: Добавление в друзья сразу без подтверждения
app.post('/api/friends/add', authenticateToken, (req, res) => {
  try {
    const { userid } = req.body;
    const fromUserId = req.user.userId;
    
    // Поиск пользователя
    const toUser = users.find(u => u.userid === userid);
    if (!toUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверка на себя
    if (toUser.id === fromUserId) {
      return res.status(400).json({ error: 'Нельзя добавить самого себя' });
    }
    
    // Проверка существующей дружбы
    const existingFriendship = friends.find(f => 
      (f.user1 === fromUserId && f.user2 === toUser.id) ||
      (f.user1 === toUser.id && f.user2 === fromUserId)
    );
    
    if (existingFriendship) {
      return res.status(400).json({ error: 'Пользователь уже в друзьях' });
    }
    
    // Создание дружбы
    const friendship = {
      id: generateId(),
      user1: fromUserId,
      user2: toUser.id,
      createdAt: new Date()
    };
    
    friends.push(friendship);
    saveFriends();
    console.log('✅ Добавлен в друзья:', req.user.username, '→', toUser.username);
    
    // Уведомление получателя через WebSocket
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
          } : null
        };
      })
      .sort((a, b) => {
        // Сначала онлайн, потом по последнему сообщению
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

// Обновление статуса
app.put('/api/user/status', authenticateToken, (req, res) => {
  try {
    const { status } = req.body;
    const userIndex = users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex !== -1) {
      users[userIndex].status = status || '💭 В сети';
      saveUsers();
      console.log('📝 Статус обновлен:', req.user.username, '→', status);
      
      // Уведомляем друзей об изменении статуса
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

// Получение сообщений
app.get('/api/messages/:friendId', authenticateToken, (req, res) => {
  try {
    const friendMessages = messages
      .filter(msg =>
        (msg.from === req.user.userId && msg.to === req.params.friendId) ||
        (msg.from === req.params.friendId && msg.to === req.user.userId)
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-200); // Последние 200 сообщений
    
    const messagesWithUsernames = friendMessages.map(msg => {
      const fromUser = users.find(u => u.id === msg.from);
      const toUser = users.find(u => u.id === msg.to);
      return {
        id: msg.id,
        from: fromUser.username,
        to: toUser.username,
        message: msg.message,
        timestamp: msg.timestamp,
        isRead: msg.isRead || false
      };
    });
    
    res.json({ success: true, messages: messagesWithUsernames });
  } catch (error) {
    console.error('❌ Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Смена темы
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
      const { to, message } = data;
      
      if (!to || !message?.trim()) {
        return socket.emit('error', { message: 'Сообщение не может быть пустым' });
      }
      
      const newMessage = {
        id: generateId(),
        from: socket.userId,
        to: to,
        message: message.trim(),
        timestamp: new Date(),
        isRead: false
      };
      
      messages.push(newMessage);
      saveMessages();
      
      const fromUser = users.find(u => u.id === socket.userId);
      const toUser = users.find(u => u.id === to);
      
      const messageData = {
        id: newMessage.id,
        from: fromUser.username,
        to: toUser.username,
        message: newMessage.message,
        timestamp: newMessage.timestamp,
        isRead: false
      };
      
      // Отправка отправителю и получателю
      socket.emit('new_message', messageData);
      
      const recipientSocketId = onlineUsers.get(to);
      if (recipientSocketId) {
        socket.to(recipientSocketId).emit('new_message', messageData);
        
        // Воспроизводим звук у получателя
        socket.to(recipientSocketId).emit('play_notification_sound');
      }
      
      console.log('💬 Сообщение отправлено:', fromUser.username, '→', toUser.username);
      
    } catch (error) {
      console.error('❌ Ошибка отправки сообщения:', error);
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });
  
  // Отметка сообщений как прочитанных
  socket.on('mark_messages_read', (data) => {
    try {
      const { friendId } = data;
      messages.forEach(msg => {
        if (msg.from === friendId && msg.to === socket.userId) {
          msg.isRead = true;
        }
      });
      saveMessages();
    } catch (error) {
      console.error('❌ Ошибка отметки сообщений:', error);
    }
  });
  
  // Ввод сообщения (typing indicator)
  socket.on('typing_start', (data) => {
    const { friendId } = data;
    const friendSocketId = onlineUsers.get(friendId);
    if (friendSocketId) {
      socket.to(friendSocketId).emit('friend_typing', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });
  
  socket.on('typing_stop', (data) => {
    const { friendId } = data;
    const friendSocketId = onlineUsers.get(friendId);
    if (friendSocketId) {
      socket.to(friendSocketId).emit('friend_stop_typing', {
        userId: socket.userId
      });
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

// 🔥 ОБРАБОТКА ОШИБОК

process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанный промис:', promise, 'причина:', reason);
});

// 🔥 ЗАПУСК СЕРВЕРА

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('🎉 Сервер успешно запущен!');
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🌐 Ссылка: http://localhost:${PORT}`);
  console.log(`⚡ Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Данные сохраняются в: ${DATA_DIR}`);
  console.log(`👥 Пользователей: ${users.length}`);
  console.log(`💬 Сообщений: ${messages.length}`);
});

module.exports = app;