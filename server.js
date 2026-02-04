const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Database file path
const DB_PATH = path.join(__dirname, 'database.json');

// Initialize database
function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        const initialDB = { users: {}, contacts: {} };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Generate unique 6-8 digit ID
function generateUserID() {
    const db = loadDB();
    let id;
    do {
        id = Math.floor(100000 + Math.random() * 9900000).toString();
    } while (db.users[id]);
    return id;
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const sessionMiddleware = session({
    secret: 'voice-call-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});

app.use(sessionMiddleware);

// Share session with Socket.io
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Auth middleware
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login.html');
    }
}

// Routes
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/login.html');
    }
});

// Signup
app.post('/api/signup', async (req, res) => {
    const { name, password } = req.body;
    
    if (!name || !password) {
        return res.status(400).json({ error: 'Name and password required' });
    }
    
    if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    
    const db = loadDB();
    
    // Check if name already exists
    const existingUser = Object.values(db.users).find(u => u.name.toLowerCase() === name.toLowerCase());
    if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
    }
    
    const userId = generateUserID();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.users[userId] = {
        id: userId,
        name: name,
        password: hashedPassword,
        createdAt: new Date().toISOString()
    };
    
    db.contacts[userId] = [];
    
    saveDB(db);
    
    req.session.userId = userId;
    res.json({ success: true, userId: userId });
});

// Login
app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    
    if (!name || !password) {
        return res.status(400).json({ error: 'Name and password required' });
    }
    
    const db = loadDB();
    
    const user = Object.values(db.users).find(u => u.name.toLowerCase() === name.toLowerCase());
    
    if (!user) {
        return res.status(400).json({ error: 'User not found' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).json({ error: 'Invalid password' });
    }
    
    req.session.userId = user.id;
    res.json({ success: true, userId: user.id });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
app.get('/api/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    
    const db = loadDB();
    const user = db.users[req.session.userId];
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        id: user.id,
        name: user.name
    });
});

// Get contacts
app.get('/api/contacts', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    
    const db = loadDB();
    const contacts = db.contacts[req.session.userId] || [];
    
    // Add user names and online status
    const enrichedContacts = contacts.map(c => {
        const user = db.users[c.id];
        return {
            ...c,
            userName: user ? user.name : 'Unknown User',
            isOnline: onlineUsers.has(c.id),
            canCall: canUsersCall(req.session.userId, c.id)
        };
    });
    
    res.json(enrichedContacts);
});

// Add contact
app.post('/api/contacts', (req, res) => {
    const { contactId, contactName } = req.body;
    
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    
    if (!contactId || !contactName) {
        return res.status(400).json({ error: 'Contact ID and name required' });
    }
    
    if (contactId === req.session.userId) {
        return res.status(400).json({ error: 'Cannot add yourself as contact' });
    }
    
    const db = loadDB();
    
    // Check if contact user exists
    if (!db.users[contactId]) {
        return res.status(400).json({ error: 'User ID not found' });
    }
    
    // Check if already in contacts
    const existingContact = db.contacts[req.session.userId].find(c => c.id === contactId);
    if (existingContact) {
        return res.status(400).json({ error: 'Contact already exists' });
    }
    
    db.contacts[req.session.userId].push({
        id: contactId,
        name: contactName,
        addedAt: new Date().toISOString()
    });
    
    saveDB(db);
    res.json({ success: true });
});

// Delete contact
app.delete('/api/contacts/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    
    const db = loadDB();
    db.contacts[req.session.userId] = db.contacts[req.session.userId].filter(c => c.id !== req.params.id);
    saveDB(db);
    
    res.json({ success: true });
});

// Check if two users can call each other (both added each other)
function canUsersCall(userId1, userId2) {
    const db = loadDB();
    
    const user1Contacts = db.contacts[userId1] || [];
    const user2Contacts = db.contacts[userId2] || [];
    
    const user1HasUser2 = user1Contacts.some(c => c.id === userId2);
    const user2HasUser1 = user2Contacts.some(c => c.id === userId1);
    
    return user1HasUser2 && user2HasUser1;
}

// Track online users
const onlineUsers = new Map(); // Map<userId, socketId>
const userSockets = new Map(); // Map<socketId, userId>

// Socket.io handling
io.on('connection', (socket) => {
    const session = socket.request.session;
    const userId = session?.userId;
    
    if (!userId) {
        socket.disconnect();
        return;
    }
    
    console.log(`User ${userId} connected`);
    
    // Register user as online
    onlineUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);
    
    // Broadcast online status
    io.emit('user-online', { userId });
    
    // Handle call initiation
    socket.on('call-user', (data) => {
        const { targetUserId } = data;
        
        // Verify both users have each other as contacts
        if (!canUsersCall(userId, targetUserId)) {
            socket.emit('call-error', { message: 'Cannot call this user. Both users must add each other as contacts.' });
            return;
        }
        
        const targetSocketId = onlineUsers.get(targetUserId);
        if (!targetSocketId) {
            socket.emit('call-error', { message: 'User is offline' });
            return;
        }
        
        const db = loadDB();
        const callerName = db.users[userId]?.name || 'Unknown';
        
        io.to(targetSocketId).emit('incoming-call', {
            callerId: userId,
            callerName: callerName
        });
    });
    
    // Handle call acceptance
    socket.on('accept-call', (data) => {
        const { callerId } = data;
        const callerSocketId = onlineUsers.get(callerId);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-accepted', { recipientId: userId });
        }
    });
    
    // Handle call rejection
    socket.on('reject-call', (data) => {
        const { callerId } = data;
        const callerSocketId = onlineUsers.get(callerId);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-rejected', { recipientId: userId });
        }
    });
    
    // WebRTC signaling
    socket.on('webrtc-offer', (data) => {
        const { targetUserId, offer } = data;
        const targetSocketId = onlineUsers.get(targetUserId);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc-offer', { callerId: userId, offer });
        }
    });
    
    socket.on('webrtc-answer', (data) => {
        const { targetUserId, answer } = data;
        const targetSocketId = onlineUsers.get(targetUserId);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc-answer', { recipientId: userId, answer });
        }
    });
    
    socket.on('webrtc-ice-candidate', (data) => {
        const { targetUserId, candidate } = data;
        const targetSocketId = onlineUsers.get(targetUserId);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc-ice-candidate', { userId, candidate });
        }
    });
    
    // Handle call end
    socket.on('end-call', (data) => {
        const { targetUserId } = data;
        const targetSocketId = onlineUsers.get(targetUserId);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-ended', { userId });
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected`);
        onlineUsers.delete(userId);
        userSockets.delete(socket.id);
        io.emit('user-offline', { userId });
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
