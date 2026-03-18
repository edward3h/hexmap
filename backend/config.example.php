<?php
// Copy this file to config.php and fill in your values.
// config.php is gitignored — never commit real credentials.

// Database
$DB_HOST = '127.0.0.1';
$DB_NAME = 'hexmap';
$DB_USER = 'your_db_user';
$DB_PASS = 'your_db_password';

// Frontend URL — where the admin SPA is served.
// In dev this is the Vite server (5173); in production it's the same origin as the API.
$APP_URL = 'http://localhost:5173';

// Google OAuth2
// Create credentials at: https://console.cloud.google.com/apis/credentials
$GOOGLE_CLIENT_ID = '';
$GOOGLE_CLIENT_SECRET = '';
$GOOGLE_REDIRECT_URI = 'http://localhost:8080/api/auth/callback?provider=google';

// Discord OAuth2
// Create app at: https://discord.com/developers/applications
$DISCORD_CLIENT_ID = '';
$DISCORD_CLIENT_SECRET = '';
$DISCORD_REDIRECT_URI = 'http://localhost:8080/api/auth/callback?provider=discord';
