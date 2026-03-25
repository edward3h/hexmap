<?php
// backend/config.test.php
// CI-only backend configuration. Copy to config.php in CI environments.
// Uses empty OAuth credentials — auth tests rely on pre-seeded session tokens, not OAuth flows.

$DB_HOST = '127.0.0.1';
$DB_NAME = 'hexmap';
$DB_USER = 'hexmap';
$DB_PASS = 'hexmap';

$APP_URL = 'http://localhost:5173';

$GOOGLE_CLIENT_ID = '';
$GOOGLE_CLIENT_SECRET = '';
$GOOGLE_REDIRECT_URI = '';

$DISCORD_CLIENT_ID = '';
$DISCORD_CLIENT_SECRET = '';
$DISCORD_REDIRECT_URI = '';
