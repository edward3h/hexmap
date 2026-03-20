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
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
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

} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/teams$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleListTeams((int)$m[1]);

} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleGetCampaign((int)$m[1]);

} elseif ($method === 'GET' && $path === '/api/resources') {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleListResources();

// ── Admin write routes (GM protected) ───────────────────────────────────────
} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTile((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/tiles$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleCreateTile((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleDeleteTile((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/attacks$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleCreateAttack((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/attacks/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleResolveAttack((int)$m[1], (int)$m[2]);

} elseif ($method === 'PUT' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/assets$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTeamAssets((int)$m[1], (int)$m[2]);

// ── Campaign management routes (auth protected) ──────────────────────────────
} elseif ($method === 'POST' && $path === '/api/campaigns') {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleCreateCampaign();

} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleUpdateCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/start$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleStartCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/pause$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handlePauseCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/resume$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleResumeCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/end$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleEndCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/teams$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleCreateTeam((int)$m[1]);

} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleUpdateTeam((int)$m[1], (int)$m[2]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleDeleteTeam((int)$m[1], (int)$m[2]);

} elseif ($method === 'GET' && $path === '/api/users') {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleListUsers();

} elseif ($method === 'GET' && $path === '/api/users/search') {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleSearchUsers();

} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/gms$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleListCampaignGms((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/gms$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleAddCampaignGm((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/gms/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleRemoveCampaignGm((int)$m[1], (int)$m[2]);

// ── Sprite routes (GM protected) ─────────────────────────────────────────────
} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/sprites$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/sprite.php';
    handleListSprites((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/sprites$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/sprite.php';
    handleUploadSprite((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/sprites/(\d+)/activate$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/sprite.php';
    handleActivateSprite((int)$m[1], (int)$m[2], (int)$m[3]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/sprite$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/sprite.php';
    handleDeassignSprite((int)$m[1], (int)$m[2]);

} elseif ($method === 'GET' && $path === '/api/health') {
    jsonResponse(['status' => 'ok']);

} else {
    jsonResponse(['error' => 'Not found'], 404);
}
