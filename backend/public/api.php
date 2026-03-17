<?php
// backend/public/api.php

declare(strict_types=1);

require_once __DIR__ . '/../src/helpers.php';
require_once __DIR__ . '/../src/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$path   = rtrim((string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');

// Handle CORS preflight
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    http_response_code(204);
    exit;
}

// ── Auth routes ──────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/api/auth/login') {
    require_once __DIR__ . '/../src/handlers/auth.php';
    handleAuthLogin($_GET['provider'] ?? '');

} elseif ($method === 'GET' && $path === '/api/auth/callback') {
    require_once __DIR__ . '/../src/handlers/auth.php';
    handleAuthCallback($_GET['provider'] ?? '');

} elseif ($method === 'POST' && $path === '/api/auth/logout') {
    require_once __DIR__ . '/../src/handlers/auth.php';
    handleAuthLogout();

} elseif ($method === 'GET' && $path === '/api/auth/me') {
    require_once __DIR__ . '/../src/handlers/auth.php';
    handleAuthMe();

// ── Campaign routes (public) ─────────────────────────────────────────────────
} elseif ($method === 'GET' && $path === '/api/campaigns') {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleListCampaigns();

} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/map-data$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleMapData((int)$m[1]);

} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleGetCampaign((int)$m[1]);

} elseif ($method === 'GET' && $path === '/api/resources') {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleListResources();

} elseif ($method === 'GET' && $path === '/api/health') {
    jsonResponse(['status' => 'ok']);

} else {
    jsonResponse(['error' => 'Not found'], 404);
}
