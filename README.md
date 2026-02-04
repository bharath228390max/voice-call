# Private Voice Calling App

A simple private voice calling web app using Node.js, Express, Socket.io, and WebRTC.

## Features

- **Authentication**: Sign up and login with username/password
- **Unique Call ID**: Each user gets a permanent 6-8 digit ID (like a phone number)
- **Contacts**: Save friends by their ID with a custom nickname
- **Private Calling**: Only users who have BOTH added each other can make calls
- **Real-time Status**: See which contacts are online
- **Voice Calls**: WebRTC-powered voice calls with:
  - Mute/unmute
  - Call timer
  - End call
- **Mobile Friendly**: Responsive design works on all devices

## Security

- Strangers cannot call you - both users must add each other as contacts
- Session-based authentication
- Passwords are hashed with bcrypt

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
node server.js
```

3. Open your browser and go to:
```
http://localhost:3000
```

## Usage

1. **Sign Up**: Create an account with a username and password
2. **Get Your ID**: After signup, you'll see your unique call ID (e.g., `739251`)
3. **Share Your ID**: Give your ID to friends so they can add you
4. **Add Contacts**: Enter a friend's ID and give them a nickname
5. **Make Calls**: Once BOTH users have added each other, the call button becomes active

## Tech Stack

- **Backend**: Node.js + Express
- **Real-time**: Socket.io
- **Voice**: WebRTC
- **Database**: JSON file (simple file-based storage)
- **Auth**: express-session + bcryptjs
- **Frontend**: Plain HTML/CSS/JS + Tailwind CSS

## Files

```
├── server.js           # Main server file
├── package.json        # Dependencies
├── database.json       # User data (auto-created)
├── public/
│   ├── login.html      # Login page
│   ├── signup.html     # Signup page
│   ├── dashboard.html  # Main dashboard with contacts
│   └── call.html       # Standalone call page
```

## Notes

- Uses Google's public STUN servers for WebRTC
- For production, consider adding TURN servers for better connectivity
- Database is a simple JSON file - use a real database for production
- HTTPS is required for microphone access in production

## License

MIT
